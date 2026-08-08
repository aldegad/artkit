// ============================================
// Agent Collaboration Bundle Format (SSoT)
// ============================================
//
// A bundle is a directory an agent writes and the CLI hands to the running app:
//
//   <bundle>/bundle.json          { format, version, ... }
//   <bundle>/project.json         a SavedVideoProject, exactly as the editor saves it
//   <bundle>/media/<sourceId>.<ext>
//
// `project.assets[]` doubles as the media manifest, so there is no separate file
// list to keep in sync. The safe pattern is one identity per media file:
//
//   asset.id === IndexedDB blob key === every clip.sourceId that plays it
//
// This module is the only place that knows the format. The CLI never parses
// `project.json`; it ships the bytes into the page and lets this code decide.

import type { AssetReference, SavedVideoProject } from "../types/project";
import type { Clip } from "../types/clip";

export const VIDEO_BUNDLE_FORMAT = "artkit-video-bundle";
export const VIDEO_BUNDLE_VERSION = 1;

export const VIDEO_BUNDLE_PROJECT_FILE = "project.json";
export const VIDEO_BUNDLE_MANIFEST_FILE = "bundle.json";
export const VIDEO_BUNDLE_MEDIA_DIR = "media";

/** Base64 characters per transfer chunk (~1.5MB of bytes) for large media. */
export const VIDEO_BUNDLE_CHUNK_LENGTH = 2 * 1024 * 1024;

export interface VideoBundleManifest {
  format: string;
  version: number;
  generator?: string;
  createdAt?: string;
  note?: string;
}

/** One media file carried by a bundle, keyed by the asset/source identity. */
export interface VideoBundleMedia {
  sourceId: string;
  fileName: string;
  mediaType: string;
  base64: string;
}

export interface VideoBundle {
  manifest: VideoBundleManifest;
  project: SavedVideoProject;
  media: VideoBundleMedia[];
}

export interface VideoBundleSummary {
  projectId: string;
  projectName: string;
  duration: number;
  frameRate: number;
  canvasSize: { width: number; height: number };
  videoTrackCount: number;
  audioTrackCount: number;
  clipCounts: { video: number; audio: number; image: number };
  maskCount: number;
  mediaKeys: string[];
}

export interface VideoBundleValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================
// Media type <-> file extension
// ============================================

const MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".weba",
  "audio/flac": ".flac",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".weba": "audio/webm",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const VIDEO_BUNDLE_FALLBACK_EXTENSION = ".bin";
export const VIDEO_BUNDLE_FALLBACK_MEDIA_TYPE = "application/octet-stream";

/** File extension (with dot) a bundle should use for a media type. */
export function extensionForMediaType(mediaType?: string | null): string {
  const normalized = (mediaType || "").split(";")[0].trim().toLowerCase();
  return MEDIA_TYPE_EXTENSIONS[normalized] || VIDEO_BUNDLE_FALLBACK_EXTENSION;
}

/** Media type a bundle file name implies. Unknown extensions stay opaque bytes. */
export function mediaTypeForFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return VIDEO_BUNDLE_FALLBACK_MEDIA_TYPE;
  const ext = fileName.slice(dot).toLowerCase();
  return EXTENSION_MEDIA_TYPES[ext] || VIDEO_BUNDLE_FALLBACK_MEDIA_TYPE;
}

/** `media/<sourceId>.<ext>` file name for one asset. */
export function mediaFileNameForAsset(
  asset: Pick<AssetReference, "id" | "mediaType" | "name">
): string {
  return `${asset.id}${extensionForMediaType(asset.mediaType)}`;
}

/** The sourceId a bundle media file name refers to (strips the extension). */
export function sourceIdFromMediaFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? fileName : fileName.slice(0, dot);
}

// ============================================
// Manifest
// ============================================

export function createVideoBundleManifest(
  overrides?: Partial<VideoBundleManifest>
): VideoBundleManifest {
  return {
    format: VIDEO_BUNDLE_FORMAT,
    version: VIDEO_BUNDLE_VERSION,
    ...overrides,
  };
}

// ============================================
// Media requirements
// ============================================

/**
 * A clip needs media bytes unless its source is self-contained.
 *
 * `restoreClipsWithLocalMedia` looks the blob up by `[clip.id, clip.sourceId]`
 * and DROPS the clip when nothing is found and `sourceUrl` is a stale `blob:`
 * URL. So a missing blob key is not an error at load time — it is a silently
 * vanished clip. Inline `data:` sources survive on their own.
 */
export function clipNeedsMediaBytes(clip: Clip): boolean {
  if (typeof clip.sourceUrl === "string" && clip.sourceUrl.startsWith("data:")) {
    return false;
  }
  if (clip.type === "image" && typeof clip.imageData === "string" && clip.imageData.length > 0) {
    return false;
  }
  return true;
}

/** Every source identity that must have bytes in IndexedDB for this project to load. */
export function requiredMediaKeys(project: SavedVideoProject): string[] {
  const keys = new Set<string>();
  for (const clip of project.project.clips) {
    if (!clipNeedsMediaBytes(clip)) continue;
    if (clip.sourceId) keys.add(clip.sourceId);
  }
  return Array.from(keys);
}

/**
 * Drop `blob:` source URLs before a project leaves the browser.
 *
 * Those URLs are handles into the session that created them, so they are dead
 * bytes in a bundle. Load rebinds every source from its IndexedDB blob anyway.
 * Inline `data:` sources are real content and stay.
 */
export function stripRuntimeSourceUrls(project: SavedVideoProject): SavedVideoProject {
  return {
    ...project,
    project: {
      ...project.project,
      clips: project.project.clips.map((clip) =>
        typeof clip.sourceUrl === "string" && clip.sourceUrl.startsWith("blob:")
          ? { ...clip, sourceUrl: "" }
          : clip
      ),
      assets: (project.project.assets || []).map((asset) =>
        typeof asset.url === "string" && asset.url.startsWith("blob:")
          ? { ...asset, url: "" }
          : asset
      ),
    },
  };
}

// ============================================
// Validation
// ============================================

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate a bundle before it touches storage. Collects every problem instead of
 * throwing on the first one, so a hand-authored bundle can be fixed in one pass.
 */
export function validateVideoBundle(bundle: VideoBundle): VideoBundleValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { manifest, project, media } = bundle;

  if (!manifest || manifest.format !== VIDEO_BUNDLE_FORMAT) {
    errors.push(
      `${VIDEO_BUNDLE_MANIFEST_FILE}: format must be "${VIDEO_BUNDLE_FORMAT}" (got ${JSON.stringify(manifest?.format)})`
    );
  }
  if (!manifest || !isFiniteNumber(manifest.version)) {
    errors.push(`${VIDEO_BUNDLE_MANIFEST_FILE}: version must be a number`);
  } else if (manifest.version > VIDEO_BUNDLE_VERSION) {
    errors.push(
      `${VIDEO_BUNDLE_MANIFEST_FILE}: version ${manifest.version} is newer than this app supports (${VIDEO_BUNDLE_VERSION})`
    );
  }

  if (!project || typeof project !== "object" || !project.project) {
    errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: missing "project" (expected a SavedVideoProject)`);
    return { ok: false, errors, warnings };
  }

  if (!project.id) errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: "id" is required`);
  if (!project.name) errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: "name" is required`);
  if (!isFiniteNumber(project.savedAt)) {
    errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: "savedAt" must be an epoch millisecond number`);
  }

  const inner = project.project;
  if (!isFiniteNumber(inner.frameRate) || inner.frameRate <= 0) {
    errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: "project.frameRate" must be a positive number`);
  }
  if (
    !inner.canvasSize ||
    !isFiniteNumber(inner.canvasSize.width) ||
    !isFiniteNumber(inner.canvasSize.height) ||
    inner.canvasSize.width <= 0 ||
    inner.canvasSize.height <= 0
  ) {
    errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: "project.canvasSize" must be positive width/height`);
  }
  if (!Array.isArray(inner.tracks)) errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: "project.tracks" must be an array`);
  if (!Array.isArray(inner.clips)) errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: "project.clips" must be an array`);
  if (!Array.isArray(inner.assets)) errors.push(`${VIDEO_BUNDLE_PROJECT_FILE}: "project.assets" must be an array`);

  if (!Array.isArray(inner.tracks) || !Array.isArray(inner.clips)) {
    return { ok: errors.length === 0, errors, warnings };
  }

  const trackIds = new Set(inner.tracks.map((track) => track.id));
  const assetIds = new Set((inner.assets || []).map((asset) => asset.id));
  const mediaKeys = new Set<string>();

  for (const entry of media) {
    if (mediaKeys.has(entry.sourceId)) {
      errors.push(`media: duplicate sourceId "${entry.sourceId}"`);
    }
    mediaKeys.add(entry.sourceId);
  }

  for (const clip of inner.clips) {
    const label = `clip "${clip.name || clip.id}"`;
    if (!clip.trackId || !trackIds.has(clip.trackId)) {
      errors.push(`${label}: trackId "${clip.trackId}" is not one of project.tracks`);
    }
    if (!isFiniteNumber(clip.startTime) || clip.startTime < 0) {
      errors.push(`${label}: startTime must be a number >= 0`);
    }
    if (!isFiniteNumber(clip.duration) || clip.duration <= 0) {
      errors.push(`${label}: duration must be a positive number`);
    }
    if (!clipNeedsMediaBytes(clip)) continue;

    if (!clip.sourceId) {
      errors.push(`${label}: sourceId is required so the clip can rebind to its media on load`);
      continue;
    }
    if (!mediaKeys.has(clip.sourceId)) {
      errors.push(
        `${label}: no media for sourceId "${clip.sourceId}" — the editor would drop this clip on load, not report an error`
      );
    }
    if (!assetIds.has(clip.sourceId)) {
      warnings.push(
        `${label}: sourceId "${clip.sourceId}" has no matching project.assets entry (asset.id should equal clip.sourceId)`
      );
    }
  }

  for (const entry of media) {
    const usedByClip = inner.clips.some((clip) => clip.sourceId === entry.sourceId);
    if (!usedByClip && !assetIds.has(entry.sourceId)) {
      errors.push(
        `media "${entry.fileName}": sourceId "${entry.sourceId}" matches no clip and no asset — bundle and project disagree`
      );
    }
    if (!entry.base64) {
      errors.push(`media "${entry.fileName}": empty payload`);
    }
  }

  const audioTracks = inner.tracks.filter((track) => track.type === "audio").map((track) => track.id);
  for (const clip of inner.clips) {
    if (clip.type === "audio" && !audioTracks.includes(clip.trackId)) {
      warnings.push(
        `clip "${clip.name || clip.id}": audio clip sits on a video track — put BGM/SFX on a track created with createAudioTrack`
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ============================================
// Summary
// ============================================

export function summarizeVideoBundleProject(project: SavedVideoProject): VideoBundleSummary {
  const inner = project.project;
  const clips = inner.clips || [];
  return {
    projectId: project.id,
    projectName: project.name,
    duration: inner.duration,
    frameRate: inner.frameRate,
    canvasSize: inner.canvasSize,
    videoTrackCount: (inner.tracks || []).filter((track) => track.type === "video").length,
    audioTrackCount: (inner.tracks || []).filter((track) => track.type === "audio").length,
    clipCounts: {
      video: clips.filter((clip) => clip.type === "video").length,
      audio: clips.filter((clip) => clip.type === "audio").length,
      image: clips.filter((clip) => clip.type === "image").length,
    },
    maskCount: (inner.masks || []).length,
    mediaKeys: requiredMediaKeys(project),
  };
}

// ============================================
// base64 <-> bytes (browser and node safe)
// ============================================

const BASE64_ENCODE_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_ENCODE_CHUNK) {
    const chunk = bytes.subarray(offset, offset + BASE64_ENCODE_CHUNK);
    result += String.fromCharCode(...chunk);
  }
  return btoa(result);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64ToBlob(base64: string, mediaType: string): Blob {
  const bytes = base64ToBytes(base64);
  return new Blob([bytes as unknown as BlobPart], {
    type: mediaType || VIDEO_BUNDLE_FALLBACK_MEDIA_TYPE,
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

/** Split a base64 payload for transfer so one giant string never crosses the bridge. */
export function chunkBase64(base64: string, chunkLength: number = VIDEO_BUNDLE_CHUNK_LENGTH): string[] {
  if (chunkLength <= 0) throw new Error("chunkBase64: chunkLength must be positive");
  const chunks: string[] = [];
  for (let offset = 0; offset < base64.length; offset += chunkLength) {
    chunks.push(base64.slice(offset, offset + chunkLength));
  }
  return chunks.length > 0 ? chunks : [""];
}
