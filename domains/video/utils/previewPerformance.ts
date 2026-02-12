export interface PreviewPerformanceConfig {
  isMobileLike: boolean;
  draftMode: boolean;
  preRenderEnabled: boolean;
  maxCanvasDpr: number;
  playbackRenderFpsCap: number;
  debugLogs: boolean;
}

type ModeSetting = "auto" | "draft" | "full";

const MODE_QUERY_KEY = "vp_mode";
const MODE_STORAGE_KEY = "video.preview.mode";
export const PRE_RENDER_QUERY_KEY = "vp_prerender";
export const PRE_RENDER_STORAGE_KEY = "video.preview.prerender";
const DEBUG_QUERY_KEY = "vp_debug";
const DEBUG_STORAGE_KEY = "video.preview.debug";
const FPS_CAP_QUERY_KEY = "vp_fps";
const FPS_CAP_STORAGE_KEY = "video.preview.fps";

function getSearchParams(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search);
}

function getStorageValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readSetting(queryKey: string, storageKey: string): string | null {
  const params = getSearchParams();
  const fromQuery = params ? params.get(queryKey) : null;
  if (fromQuery !== null) return fromQuery;
  return getStorageValue(storageKey);
}

function parseBool(value: string | null): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "on", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "off", "no", "n"].includes(normalized)) return false;
  return null;
}

function parseMode(value: string | null): ModeSetting | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "draft" || normalized === "full") {
    return normalized;
  }
  return null;
}

function parseFpsCap(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(15, Math.min(60, Math.round(parsed)));
}

function detectMobileLikeDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth > 0 && window.innerWidth <= 1024;
  return mobileUA || (coarsePointer && narrowViewport);
}

export function resolvePreRenderEnabledSetting(): boolean {
  return resolvePreviewPerformanceConfig().preRenderEnabled;
}

export function setPreRenderEnabledSetting(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRE_RENDER_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage failures (private mode / quota)
  }
}

export function resolvePreviewPerformanceConfig(): PreviewPerformanceConfig {
  const isMobileLike = detectMobileLikeDevice();

  const mode = parseMode(readSetting(MODE_QUERY_KEY, MODE_STORAGE_KEY)) ?? "auto";
  const draftMode =
    mode === "draft" || (mode === "auto" && isMobileLike);

  const preRenderDefault = !draftMode;
  const preRenderEnabled =
    parseBool(readSetting(PRE_RENDER_QUERY_KEY, PRE_RENDER_STORAGE_KEY)) ?? preRenderDefault;

  const fpsCapDefault = draftMode ? 30 : 60;
  const playbackRenderFpsCap =
    parseFpsCap(readSetting(FPS_CAP_QUERY_KEY, FPS_CAP_STORAGE_KEY)) ?? fpsCapDefault;

  const debugDefault = process.env.NODE_ENV !== "production";
  const debugLogs =
    parseBool(readSetting(DEBUG_QUERY_KEY, DEBUG_STORAGE_KEY)) ?? debugDefault;

  return {
    isMobileLike,
    draftMode,
    preRenderEnabled,
    // Keep preview sharp on smaller/mobile viewports by avoiding forced DPR=1.
    maxCanvasDpr: 2,
    playbackRenderFpsCap,
    debugLogs,
  };
}
