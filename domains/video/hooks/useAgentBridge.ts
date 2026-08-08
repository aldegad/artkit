"use client";

// ============================================
// Agent Collaboration Bridge
// ============================================
//
// artkit is a fully client-side static app, so a CLI cannot reach its IndexedDB
// directly. This hook publishes a small surface on `window` that a Playwright
// driver calls through `page.evaluate`, and every operation goes through the
// editor's existing storage/restore code rather than reimplementing it:
//
//   IN  : saveMediaBlob -> saveVideoProject -> applyLoadedProject
//   OUT : loadVideoAutosave / getVideoProject + loadMediaBlob
//
// Exposure is opt-in (dev by default) so the deployed static build does not ship
// a storage-write API on `window`.

import { useEffect, useRef } from "react";
import type { SavedVideoProject } from "../types";
import { getAllVideoProjects, getVideoProject, saveVideoProject } from "../utils/videoStorage";
import { loadMediaBlob, saveMediaBlob } from "../utils/mediaStorage";
import { loadVideoAutosave } from "../utils/videoAutosave";
import {
  base64ToBlob,
  blobToBase64,
  chunkBase64,
  createVideoBundleManifest,
  extensionForMediaType,
  mediaTypeForFileName,
  requiredMediaKeys,
  sourceIdFromMediaFileName,
  stripRuntimeSourceUrls,
  summarizeVideoBundleProject,
  validateVideoBundle,
  VIDEO_BUNDLE_FORMAT,
  VIDEO_BUNDLE_VERSION,
  type VideoBundleManifest,
  type VideoBundleMedia,
  type VideoBundleSummary,
} from "../utils/videoBundle";

export const AGENT_BRIDGE_GLOBAL = "__artkitVideoBridge";
export const AGENT_BRIDGE_PROTOCOL = 1;

/** Dev by default; a local production build can opt in explicitly. */
export function isAgentBridgeEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ARTKIT_AGENT_BRIDGE === "1"
  );
}

export interface AgentBridgeProjectEntry {
  id: string;
  name: string;
  projectGroup?: string;
  savedAt: number;
}

export interface AgentBridgeImportResult {
  projectId: string;
  projectName: string;
  summary: VideoBundleSummary;
  warnings: string[];
  mediaWritten: string[];
  activated: boolean;
}

export interface AgentBridgeExportResult {
  source: "autosave" | "project";
  manifest: VideoBundleManifest;
  project: SavedVideoProject;
  summary: VideoBundleSummary;
}

export interface AgentBridgeMediaHandle {
  sourceId: string;
  fileName: string;
  mediaType: string;
  byteLength: number;
  chunkCount: number;
}

export interface ArtkitVideoBridge {
  readonly protocol: number;
  readonly format: string;
  readonly formatVersion: number;
  /** True once the video editor is mounted and a project can be applied live. */
  isEditorReady(): boolean;
  listProjects(): Promise<AgentBridgeProjectEntry[]>;

  // IN — staged so a large media file never crosses as one string.
  beginImport(manifestJson: string, projectJson: string): Promise<{ importId: string }>;
  pushMediaChunk(importId: string, fileName: string, chunkBase64: string): Promise<{ received: number }>;
  commitImport(importId: string, options?: { activate?: boolean }): Promise<AgentBridgeImportResult>;
  abortImport(importId: string): Promise<void>;

  // OUT
  exportLive(): Promise<AgentBridgeExportResult>;
  exportProject(projectId: string): Promise<AgentBridgeExportResult>;
  prepareMediaExport(sourceId: string): Promise<AgentBridgeMediaHandle>;
  readMediaExportChunk(sourceId: string, index: number): Promise<string>;
  releaseMediaExport(sourceId: string): Promise<void>;
}

interface ImportStaging {
  manifest: VideoBundleManifest;
  project: SavedVideoProject;
  media: Map<string, { fileName: string; parts: string[] }>;
}

export interface UseAgentBridgeOptions {
  /** Applies a project record to the live editor (from useVideoProjectLibrary). */
  applyLoadedProject: (loaded: SavedVideoProject) => Promise<void>;
  /** Called after a project record is written so the project list stays current. */
  onProjectsChanged?: () => Promise<void> | void;
  /** False while the editor has not finished restoring its own state. */
  isEditorReady?: boolean;
}

function buildSavedProjectFromAutosave(
  data: NonNullable<Awaited<ReturnType<typeof loadVideoAutosave>>>
): SavedVideoProject {
  return {
    id: data.project.id,
    name: data.projectName || data.project.name,
    projectGroup: data.projectGroup,
    project: data.project,
    timelineView: data.timelineView,
    currentTime: data.currentTime,
    playbackRange: data.playbackRange,
    savedAt: data.savedAt,
  };
}

export function useAgentBridge(options: UseAgentBridgeOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stagingRef = useRef(new Map<string, ImportStaging>());
  const mediaExportRef = useRef(new Map<string, { handle: AgentBridgeMediaHandle; chunks: string[] }>());
  const importCounterRef = useRef(0);

  useEffect(() => {
    // Inline literal comparisons, not the isAgentBridgeEnabled() call, so the
    // condition is decided at build time rather than by a cross-module call.
    //
    // Measured 2026-08-08: this does NOT strip the surface from the deployed
    // bundle either way — the bytes ship. What it guarantees is the part that
    // matters, verified against a real `next build` served statically:
    // `window.__artkitVideoBridge` is `undefined` in production, so nothing can
    // reach storage through it.
    if (
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_ARTKIT_AGENT_BRIDGE !== "1"
    ) {
      return;
    }
    if (typeof window === "undefined") return;

    const staging = stagingRef.current;
    const mediaExports = mediaExportRef.current;

    const requireStaging = (importId: string): ImportStaging => {
      const entry = staging.get(importId);
      if (!entry) throw new Error(`unknown importId "${importId}" (begin an import first)`);
      return entry;
    };

    const toExportResult = (
      source: "autosave" | "project",
      project: SavedVideoProject
    ): AgentBridgeExportResult => {
      const stripped = stripRuntimeSourceUrls(project);
      return {
        source,
        manifest: createVideoBundleManifest({
          generator: `artkit-bridge/${AGENT_BRIDGE_PROTOCOL}`,
          createdAt: new Date().toISOString(),
          note: source === "autosave" ? "dumped from the live editor state" : "dumped from a saved project record",
        }),
        project: stripped,
        summary: summarizeVideoBundleProject(stripped),
      };
    };

    const bridge: ArtkitVideoBridge = {
      protocol: AGENT_BRIDGE_PROTOCOL,
      format: VIDEO_BUNDLE_FORMAT,
      formatVersion: VIDEO_BUNDLE_VERSION,

      isEditorReady() {
        return optionsRef.current.isEditorReady !== false;
      },

      async listProjects() {
        const projects = await getAllVideoProjects();
        return projects.map((project) => ({
          id: project.id,
          name: project.name,
          projectGroup: project.projectGroup,
          savedAt: project.savedAt,
        }));
      },

      async beginImport(manifestJson, projectJson) {
        importCounterRef.current += 1;
        const importId = `import-${Date.now()}-${importCounterRef.current}`;
        staging.set(importId, {
          manifest: JSON.parse(manifestJson) as VideoBundleManifest,
          project: JSON.parse(projectJson) as SavedVideoProject,
          media: new Map(),
        });
        return { importId };
      },

      async pushMediaChunk(importId, fileName, chunk) {
        const entry = requireStaging(importId);
        const existing = entry.media.get(fileName) || { fileName, parts: [] };
        existing.parts.push(chunk);
        entry.media.set(fileName, existing);
        return { received: existing.parts.reduce((total, part) => total + part.length, 0) };
      },

      async abortImport(importId) {
        staging.delete(importId);
      },

      async commitImport(importId, commitOptions) {
        const entry = requireStaging(importId);
        const media: VideoBundleMedia[] = Array.from(entry.media.values()).map((file) => ({
          sourceId: sourceIdFromMediaFileName(file.fileName),
          fileName: file.fileName,
          mediaType: mediaTypeForFileName(file.fileName),
          base64: file.parts.join(""),
        }));

        const validation = validateVideoBundle({
          manifest: entry.manifest,
          project: entry.project,
          media,
        });
        if (!validation.ok) {
          staging.delete(importId);
          throw new Error(`bundle rejected:\n- ${validation.errors.join("\n- ")}`);
        }

        // Bytes first: a project record whose media is missing loads as silently
        // dropped clips, so never publish the record before its blobs exist.
        const mediaWritten: string[] = [];
        for (const file of media) {
          await saveMediaBlob(file.sourceId, base64ToBlob(file.base64, file.mediaType));
          mediaWritten.push(file.sourceId);
        }

        await saveVideoProject(entry.project);
        await optionsRef.current.onProjectsChanged?.();

        const shouldActivate = commitOptions?.activate !== false;
        let activated = false;
        if (shouldActivate) {
          await optionsRef.current.applyLoadedProject(entry.project);
          activated = true;
        }

        staging.delete(importId);
        return {
          projectId: entry.project.id,
          projectName: entry.project.name,
          summary: summarizeVideoBundleProject(entry.project),
          warnings: validation.warnings,
          mediaWritten,
          activated,
        };
      },

      async exportLive() {
        const data = await loadVideoAutosave();
        if (!data) {
          throw new Error(
            "no live editor state — open /video and place at least one clip (autosave only runs with clips present)"
          );
        }
        return toExportResult("autosave", buildSavedProjectFromAutosave(data));
      },

      async exportProject(projectId) {
        const project = await getVideoProject(projectId);
        if (!project) throw new Error(`no saved project with id "${projectId}"`);
        return toExportResult("project", project);
      },

      async prepareMediaExport(sourceId) {
        const blob = await loadMediaBlob(sourceId);
        if (!blob) throw new Error(`no media blob for sourceId "${sourceId}"`);
        const base64 = await blobToBase64(blob);
        const chunks = chunkBase64(base64);
        const handle: AgentBridgeMediaHandle = {
          sourceId,
          fileName: `${sourceId}${extensionForMediaType(blob.type)}`,
          mediaType: blob.type,
          byteLength: blob.size,
          chunkCount: chunks.length,
        };
        mediaExports.set(sourceId, { handle, chunks });
        return handle;
      },

      async readMediaExportChunk(sourceId, index) {
        const entry = mediaExports.get(sourceId);
        if (!entry) throw new Error(`media export for "${sourceId}" was not prepared`);
        const chunk = entry.chunks[index];
        if (chunk === undefined) {
          throw new Error(`chunk ${index} out of range for "${sourceId}" (${entry.chunks.length} chunks)`);
        }
        return chunk;
      },

      async releaseMediaExport(sourceId) {
        mediaExports.delete(sourceId);
      },
    };

    (window as unknown as Record<string, unknown>)[AGENT_BRIDGE_GLOBAL] = bridge;
    console.info(
      `[artkit] agent bridge ready on window.${AGENT_BRIDGE_GLOBAL} (protocol ${AGENT_BRIDGE_PROTOCOL})`
    );

    return () => {
      delete (window as unknown as Record<string, unknown>)[AGENT_BRIDGE_GLOBAL];
      staging.clear();
      mediaExports.clear();
    };
  }, []);
}

/** Every source identity a bundle export must fetch bytes for. */
export function agentBridgeMediaKeys(project: SavedVideoProject): string[] {
  return requiredMediaKeys(project);
}
