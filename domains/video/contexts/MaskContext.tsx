"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  ReactNode,
} from "react";
import {
  MaskData,
  MaskBrushSettings,
  MaskDrawShape,
  DEFAULT_MASK_BRUSH,
  createMaskData,
} from "../types";
import { Size } from "@/shared/types";
import type { BrushPreset } from "@/domains/image/types/brush";
import { DEFAULT_BRUSH_PRESETS } from "@/domains/image/constants/brushPresets";

export interface MaskRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MaskContextValue {
  // Current mask being edited
  activeMaskId: string | null;
  activeTrackId: string | null;
  isEditingMask: boolean;

  // Brush settings
  brushSettings: MaskBrushSettings;
  setBrushSettings: (settings: Partial<MaskBrushSettings>) => void;
  setBrushSize: (size: number) => void;
  setBrushHardness: (hardness: number) => void;
  setBrushMode: (mode: "paint" | "erase") => void;
  maskDrawShape: MaskDrawShape;
  setMaskDrawShape: (shape: MaskDrawShape) => void;
  maskRegion: MaskRegion | null;
  setMaskRegion: (region: MaskRegion | null) => void;
  hasMaskRegion: boolean;
  maskRegionClearRequestId: number;
  requestMaskRegionClear: () => void;
  activePreset: BrushPreset;
  setActivePreset: (preset: BrushPreset) => void;
  presets: BrushPreset[];
  pressureEnabled: boolean;
  setPressureEnabled: (enabled: boolean) => void;
  canUndoMask: boolean;
  canRedoMask: boolean;
  maskCanvasVersion: number;
  saveMaskHistoryPoint: () => void;
  undoMask: () => void;
  redoMask: () => void;
  clearMaskHistory: () => void;

  // Mask data
  masks: Map<string, MaskData>;

  // Actions
  restoreMasks: (masks: MaskData[]) => void;
  selectMask: (maskId: string) => void;
  deselectMask: () => void;
  startMaskEdit: (trackId: string, canvasSize: Size, currentTime: number, clipStartTime?: number, clipDuration?: number) => string;
  startMaskEditById: (maskId: string) => void;
  endMaskEdit: () => void;
  saveMaskData: () => void;
  addMask: (trackId: string, size: Size, startTime: number, duration: number) => string;
  addMasks: (newMasks: MaskData[]) => string[];
  duplicateMask: (maskId: string) => string | null;
  duplicateMasksToTrack: (sourceTrackId: string, targetTrackId: string) => string[];
  deleteMask: (maskId: string) => void;
  updateMaskTime: (maskId: string, startTime: number, duration: number) => void;
  moveMask: (maskId: string, trackId: string, startTime: number) => void;
  getMasksForTrack: (trackId: string) => MaskData[];
  getMaskAtTimeForTrack: (trackId: string, time: number) => string | null;

  // Refs for drawing
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const MaskContext = createContext<MaskContextValue | null>(null);
const MAX_MASK_HISTORY = 100;

interface MaskHistorySnapshot {
  masks: Map<string, MaskData>;
  activeMaskId: string | null;
  activeTrackId: string | null;
  isEditingMask: boolean;
}

function isTimeInsideMask(mask: MaskData, time: number): boolean {
  return time >= mask.startTime && time < mask.startTime + mask.duration;
}

function findMaskAtTime(trackMasks: MaskData[], time: number): MaskData | null {
  if (trackMasks.length === 0) return null;

  let lo = 0;
  let hi = trackMasks.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (trackMasks[mid].startTime <= time) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (candidate < 0) return null;

  const primary = trackMasks[candidate];
  if (isTimeInsideMask(primary, time)) return primary;

  for (let i = candidate - 1; i >= 0; i -= 1) {
    const mask = trackMasks[i];
    if (mask.startTime + mask.duration <= time) break;
    if (isTimeInsideMask(mask, time)) return mask;
  }

  return null;
}

function cloneMask(mask: MaskData): MaskData {
  return {
    ...mask,
    size: { ...mask.size },
  };
}

function cloneMasksMap(source: Map<string, MaskData>): Map<string, MaskData> {
  const next = new Map<string, MaskData>();
  for (const [id, mask] of source.entries()) {
    next.set(id, cloneMask(mask));
  }
  return next;
}

export function MaskProvider({ children }: { children: ReactNode }) {
  const [masks, setMasks] = useState<Map<string, MaskData>>(new Map());
  const [activeMaskId, setActiveMaskId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isEditingMask, setIsEditingMask] = useState(false);
  const [brushSettings, setBrushSettingsState] = useState<MaskBrushSettings>(DEFAULT_MASK_BRUSH);
  const [maskDrawShape, setMaskDrawShapeState] = useState<MaskDrawShape>("brush");
  const [maskRegion, setMaskRegionState] = useState<MaskRegion | null>(null);
  const [maskRegionClearRequestId, setMaskRegionClearRequestId] = useState(0);
  const [presets] = useState<BrushPreset[]>(() => [...DEFAULT_BRUSH_PRESETS]);
  const [activePreset, setActivePresetState] = useState<BrushPreset>(() => DEFAULT_BRUSH_PRESETS[0]);
  const [pressureEnabled, setPressureEnabledState] = useState(true);
  const [canUndoMask, setCanUndoMask] = useState(false);
  const [canRedoMask, setCanRedoMask] = useState(false);
  const [maskCanvasVersion, setMaskCanvasVersion] = useState(0);

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskLoadVersionRef = useRef(0);
  const masksRef = useRef(masks);
  const activeMaskIdRef = useRef(activeMaskId);
  const activeTrackIdRef = useRef(activeTrackId);
  const isEditingMaskRef = useRef(isEditingMask);
  const historyPastRef = useRef<MaskHistorySnapshot[]>([]);
  const historyFutureRef = useRef<MaskHistorySnapshot[]>([]);

  masksRef.current = masks;
  activeMaskIdRef.current = activeMaskId;
  activeTrackIdRef.current = activeTrackId;
  isEditingMaskRef.current = isEditingMask;

  const masksByTrack = useMemo(() => {
    const index = new Map<string, MaskData[]>();
    for (const mask of masks.values()) {
      const list = index.get(mask.trackId);
      if (list) {
        list.push(mask);
      } else {
        index.set(mask.trackId, [mask]);
      }
    }
    for (const list of index.values()) {
      list.sort((a, b) => a.startTime - b.startTime);
    }
    return index;
  }, [masks]);

  const syncHistoryFlags = useCallback(() => {
    setCanUndoMask(historyPastRef.current.length > 0);
    setCanRedoMask(historyFutureRef.current.length > 0);
  }, []);

  const bumpMaskCanvasVersion = useCallback(() => {
    setMaskCanvasVersion((prev) => prev + 1);
  }, []);

  const captureHistorySnapshot = useCallback((): MaskHistorySnapshot => {
    return {
      masks: cloneMasksMap(masksRef.current),
      activeMaskId: activeMaskIdRef.current,
      activeTrackId: activeTrackIdRef.current,
      isEditingMask: isEditingMaskRef.current,
    };
  }, []);

  const restoreMaskCanvasFromSnapshot = useCallback((snapshot: MaskHistorySnapshot) => {
    requestAnimationFrame(() => {
      const canvas = maskCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (!snapshot.isEditingMask || !snapshot.activeMaskId) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        bumpMaskCanvasVersion();
        return;
      }

      const mask = snapshot.masks.get(snapshot.activeMaskId);
      if (!mask) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        bumpMaskCanvasVersion();
        return;
      }

      canvas.width = mask.size.width;
      canvas.height = mask.size.height;
      ctx.clearRect(0, 0, mask.size.width, mask.size.height);
      const loadVersion = ++maskLoadVersionRef.current;

      if (mask.maskData) {
        const img = new Image();
        img.onload = () => {
          if (loadVersion !== maskLoadVersionRef.current) return;
          if (!maskCanvasRef.current) return;
          const drawCtx = maskCanvasRef.current.getContext("2d");
          if (!drawCtx) return;
          drawCtx.clearRect(0, 0, mask.size.width, mask.size.height);
          drawCtx.drawImage(img, 0, 0, mask.size.width, mask.size.height);
          bumpMaskCanvasVersion();
        };
        img.src = mask.maskData;
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, mask.size.width, mask.size.height);
        bumpMaskCanvasVersion();
      }
    });
  }, [bumpMaskCanvasVersion]);

  const saveMaskHistoryPoint = useCallback(() => {
    historyPastRef.current.push(captureHistorySnapshot());
    if (historyPastRef.current.length > MAX_MASK_HISTORY) {
      historyPastRef.current.shift();
    }
    historyFutureRef.current = [];
    syncHistoryFlags();
  }, [captureHistorySnapshot, syncHistoryFlags]);

  const clearMaskHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const undoMask = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;

    historyFutureRef.current.push(captureHistorySnapshot());
    setMasks(cloneMasksMap(previous.masks));
    setActiveMaskId(previous.activeMaskId);
    setActiveTrackId(previous.activeTrackId);
    setIsEditingMask(previous.isEditingMask);
    restoreMaskCanvasFromSnapshot(previous);
    syncHistoryFlags();
  }, [captureHistorySnapshot, restoreMaskCanvasFromSnapshot, syncHistoryFlags]);

  const redoMask = useCallback(() => {
    const next = historyFutureRef.current.pop();
    if (!next) return;

    historyPastRef.current.push(captureHistorySnapshot());
    setMasks(cloneMasksMap(next.masks));
    setActiveMaskId(next.activeMaskId);
    setActiveTrackId(next.activeTrackId);
    setIsEditingMask(next.isEditingMask);
    restoreMaskCanvasFromSnapshot(next);
    syncHistoryFlags();
  }, [captureHistorySnapshot, restoreMaskCanvasFromSnapshot, syncHistoryFlags]);

  // Brush settings
  const setBrushSettings = useCallback((settings: Partial<MaskBrushSettings>) => {
    setBrushSettingsState((prev) => ({ ...prev, ...settings }));
  }, []);

  const setBrushSize = useCallback((size: number) => {
    setBrushSettingsState((prev) => ({ ...prev, size }));
  }, []);

  const setBrushHardness = useCallback((hardness: number) => {
    setBrushSettingsState((prev) => ({ ...prev, hardness }));
  }, []);

  const setBrushMode = useCallback((mode: "paint" | "erase") => {
    setBrushSettingsState((prev) => ({ ...prev, mode }));
  }, []);

  const setMaskDrawShape = useCallback((shape: MaskDrawShape) => {
    setMaskDrawShapeState(shape);
  }, []);

  const setMaskRegion = useCallback((region: MaskRegion | null) => {
    setMaskRegionState(region);
  }, []);

  const requestMaskRegionClear = useCallback(() => {
    setMaskRegionState(null);
    setMaskRegionClearRequestId((prev) => prev + 1);
  }, []);

  const setActivePreset = useCallback((preset: BrushPreset) => {
    setActivePresetState(preset);
    setBrushSettingsState((prev) => ({
      ...prev,
      size: preset.defaultSize,
      hardness: preset.defaultHardness,
    }));
  }, []);

  const setPressureEnabled = useCallback((enabled: boolean) => {
    setPressureEnabledState(enabled);
  }, []);

  // Restore masks from saved data (autosave / project load)
  const restoreMasks = useCallback((savedMasks: MaskData[]) => {
    const map = new Map<string, MaskData>();
    for (const mask of savedMasks) {
      map.set(mask.id, cloneMask(mask));
    }
    setMasks(map);
    clearMaskHistory();
  }, [clearMaskHistory]);

  // Select a mask (highlight without entering edit mode)
  const selectMask = useCallback((maskId: string) => {
    const mask = masks.get(maskId);
    if (!mask) return;
    setActiveMaskId(maskId);
    setActiveTrackId(mask.trackId);
  }, [masks]);

  // Deselect mask
  const deselectMask = useCallback(() => {
    if (isEditingMask) return;
    setActiveMaskId(null);
    setActiveTrackId(null);
  }, [isEditingMask]);

  // Create a new mask for a track
  const addMask = useCallback((trackId: string, size: Size, startTime: number, duration: number): string => {
    saveMaskHistoryPoint();
    const mask = createMaskData(trackId, size, startTime, duration);
    setMasks((prev) => {
      const next = new Map(prev);
      next.set(mask.id, mask);
      return next;
    });
    return mask.id;
  }, [saveMaskHistoryPoint]);

  const addMasks = useCallback((newMasks: MaskData[]): string[] => {
    if (newMasks.length === 0) return [];
    saveMaskHistoryPoint();
    const addedIds = newMasks.map((mask) => mask.id);
    setMasks((prev) => {
      const next = new Map(prev);
      for (const mask of newMasks) {
        next.set(mask.id, cloneMask(mask));
      }
      return next;
    });
    return addedIds;
  }, [saveMaskHistoryPoint]);

  // Duplicate a mask
  const duplicateMask = useCallback((maskId: string): string | null => {
    const source = masks.get(maskId);
    if (!source) return null;
    saveMaskHistoryPoint();
    const newId = crypto.randomUUID();
    setMasks((prev) => {
      const next = new Map(prev);
      next.set(newId, { ...source, id: newId });
      return next;
    });
    return newId;
  }, [masks, saveMaskHistoryPoint]);

  const duplicateMasksToTrack = useCallback((sourceTrackId: string, targetTrackId: string): string[] => {
    if (!sourceTrackId || !targetTrackId || sourceTrackId === targetTrackId) return [];

    saveMaskHistoryPoint();
    const newIds: string[] = [];
    setMasks((prev) => {
      const next = new Map(prev);
      for (const mask of prev.values()) {
        if (mask.trackId !== sourceTrackId) continue;
        const newId = crypto.randomUUID();
        newIds.push(newId);
        next.set(newId, {
          ...mask,
          id: newId,
          trackId: targetTrackId,
        });
      }
      return next;
    });
    return newIds;
  }, [saveMaskHistoryPoint]);

  // Delete a mask
  const deleteMask = useCallback((maskId: string) => {
    if (!masks.has(maskId)) return;
    saveMaskHistoryPoint();
    setMasks((prev) => {
      const next = new Map(prev);
      next.delete(maskId);
      return next;
    });
    if (activeMaskId === maskId) {
      setActiveMaskId(null);
      setActiveTrackId(null);
      setIsEditingMask(false);
    }
  }, [activeMaskId, masks, saveMaskHistoryPoint]);

  // Update mask time range
  const updateMaskTime = useCallback((maskId: string, startTime: number, duration: number) => {
    const source = masks.get(maskId);
    if (!source) return;
    if (source.startTime === startTime && source.duration === duration) return;
    saveMaskHistoryPoint();
    setMasks((prev) => {
      const mask = prev.get(maskId);
      if (!mask) return prev;
      const next = new Map(prev);
      next.set(maskId, { ...mask, startTime, duration });
      return next;
    });
  }, [masks, saveMaskHistoryPoint]);

  const moveMask = useCallback((maskId: string, trackId: string, startTime: number) => {
    const source = masks.get(maskId);
    if (!source) return;
    if (source.trackId === trackId && source.startTime === startTime) return;
    saveMaskHistoryPoint();
    setMasks((prev) => {
      const mask = prev.get(maskId);
      if (!mask) return prev;
      const next = new Map(prev);
      next.set(maskId, { ...mask, trackId, startTime });
      return next;
    });
    if (activeMaskId === maskId) {
      setActiveTrackId(trackId);
    }
  }, [activeMaskId, masks, saveMaskHistoryPoint]);

  // Get all masks for a track
  const getMasksForTrack = useCallback(
    (trackId: string): MaskData[] => {
      const trackMasks = masksByTrack.get(trackId);
      return trackMasks ? [...trackMasks] : [];
    },
    [masksByTrack]
  );

  // Helper: load mask image data onto canvas (handles async image loading)
  const loadMaskOntoCanvas = useCallback(
    (maskDataUrl: string, width: number, height: number) => {
      if (!maskCanvasRef.current) return;
      const ctx = maskCanvasRef.current.getContext("2d");
      if (!ctx) return;

      const loadVersion = ++maskLoadVersionRef.current;
      const img = new Image();
      img.onload = () => {
        if (loadVersion !== maskLoadVersionRef.current) return;
        if (!maskCanvasRef.current) return;
        const c = maskCanvasRef.current.getContext("2d");
        if (!c) return;
        c.clearRect(0, 0, width, height);
        c.drawImage(img, 0, 0, width, height);
      };
      img.src = maskDataUrl;
    },
    []
  );

  // Save current canvas state back to mask data
  const saveMaskData = useCallback(() => {
    if (!activeMaskId || !maskCanvasRef.current) return;
    const dataUrl = maskCanvasRef.current.toDataURL("image/png");
    setMasks((prev) => {
      const mask = prev.get(activeMaskId);
      if (!mask) return prev;
      const next = new Map(prev);
      next.set(activeMaskId, { ...mask, maskData: dataUrl });
      return next;
    });
  }, [activeMaskId]);

  // Start editing a mask (find existing or create new)
  const startMaskEdit = useCallback(
    (trackId: string, canvasSize: Size, currentTime: number, clipStartTime?: number, clipDuration?: number): string => {
      // Save current mask before switching
      if (activeMaskId && maskCanvasRef.current) {
        const dataUrl = maskCanvasRef.current.toDataURL("image/png");
        setMasks((prev) => {
          const mask = prev.get(activeMaskId);
          if (!mask) return prev;
          const next = new Map(prev);
          next.set(activeMaskId, { ...mask, maskData: dataUrl });
          return next;
        });
      }

      // Find existing mask at current time on this track
      let mask: MaskData | null = null;
      for (const m of masks.values()) {
        if (m.trackId === trackId && currentTime >= m.startTime && currentTime < m.startTime + m.duration) {
          mask = m;
          break;
        }
      }

      if (!mask) {
        const start = clipStartTime ?? currentTime;
        const dur = clipDuration ?? 5;
        const maskId = addMask(trackId, canvasSize, start, dur);
        mask = { ...createMaskData(trackId, canvasSize, start, dur), id: maskId };
      }

      setActiveMaskId(mask.id);
      setActiveTrackId(trackId);
      setIsEditingMask(true);
      setMaskRegionState(null);

      // Initialize mask canvas
      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = canvasSize.width;
        maskCanvasRef.current.height = canvasSize.height;
        const ctx = maskCanvasRef.current.getContext("2d");
        if (ctx) {
          maskLoadVersionRef.current += 1;
          ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
          if (mask.maskData) {
            // Load existing mask data
            loadMaskOntoCanvas(mask.maskData, canvasSize.width, canvasSize.height);
          } else {
            // Default: fill white (everything visible)
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
          }
        }
      }

      return mask.id;
    },
    [masks, addMask, activeMaskId, loadMaskOntoCanvas]
  );

  // Start editing a specific mask by ID (e.g., clicking mask clip in timeline)
  const startMaskEditById = useCallback(
    (maskId: string) => {
      const mask = masks.get(maskId);
      if (!mask) return;

      // Already editing this mask - no-op
      if (activeMaskId === maskId && isEditingMask) return;

      // Save current mask before switching
      if (activeMaskId && activeMaskId !== maskId && maskCanvasRef.current) {
        const dataUrl = maskCanvasRef.current.toDataURL("image/png");
        setMasks((prev) => {
          const m = prev.get(activeMaskId);
          if (!m) return prev;
          const next = new Map(prev);
          next.set(activeMaskId, { ...m, maskData: dataUrl });
          return next;
        });
      }

      setActiveMaskId(maskId);
      setActiveTrackId(mask.trackId);
      setIsEditingMask(true);
      setMaskRegionState(null);

      // Initialize mask canvas
      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = mask.size.width;
        maskCanvasRef.current.height = mask.size.height;
        const ctx = maskCanvasRef.current.getContext("2d");
        if (ctx) {
          maskLoadVersionRef.current += 1;
          ctx.clearRect(0, 0, mask.size.width, mask.size.height);
          if (mask.maskData) {
            // Load existing mask data
            loadMaskOntoCanvas(mask.maskData, mask.size.width, mask.size.height);
          } else {
            // Default: fill white (everything visible)
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, mask.size.width, mask.size.height);
          }
        }
      }
    },
    [masks, activeMaskId, isEditingMask, loadMaskOntoCanvas]
  );

  // End mask editing (auto-saves current canvas state)
  const endMaskEdit = useCallback(() => {
    // Auto-save before ending
    if (activeMaskId && maskCanvasRef.current) {
      const dataUrl = maskCanvasRef.current.toDataURL("image/png");
      setMasks((prev) => {
        const mask = prev.get(activeMaskId);
        if (!mask) return prev;
        const next = new Map(prev);
        next.set(activeMaskId, { ...mask, maskData: dataUrl });
        return next;
      });
    }
    setActiveMaskId(null);
    setActiveTrackId(null);
    setIsEditingMask(false);
    setMaskRegionState(null);
    maskLoadVersionRef.current += 1;
  }, [activeMaskId]);

  const hasMaskRegion = maskRegion !== null;

  // Get mask data for a track at an absolute timeline time
  const getMaskAtTimeForTrack = useCallback(
    (trackId: string, time: number): string | null => {
      const trackMasks = masksByTrack.get(trackId);
      if (!trackMasks) return null;

      const mask = findMaskAtTime(trackMasks, time);
      if (!mask) return null;

      // Currently editing this mask within its time range - use live canvas
      if (isEditingMask && activeMaskId === mask.id && maskCanvasRef.current) {
        return "__live_canvas__";
      }

      // Return saved mask data
      return mask.maskData;
    },
    [masksByTrack, isEditingMask, activeMaskId]
  );

  const value: MaskContextValue = {
    activeMaskId,
    activeTrackId,
    isEditingMask,
    brushSettings,
    setBrushSettings,
    setBrushSize,
    setBrushHardness,
    setBrushMode,
    maskDrawShape,
    setMaskDrawShape,
    maskRegion,
    setMaskRegion,
    hasMaskRegion,
    maskRegionClearRequestId,
    requestMaskRegionClear,
    activePreset,
    setActivePreset,
    presets,
    pressureEnabled,
    setPressureEnabled,
    canUndoMask,
    canRedoMask,
    maskCanvasVersion,
    saveMaskHistoryPoint,
    undoMask,
    redoMask,
    clearMaskHistory,
    masks,
    restoreMasks,
    selectMask,
    deselectMask,
    startMaskEdit,
    startMaskEditById,
    endMaskEdit,
    saveMaskData,
    addMask,
    addMasks,
    duplicateMask,
    duplicateMasksToTrack,
    deleteMask,
    updateMaskTime,
    moveMask,
    getMasksForTrack,
    getMaskAtTimeForTrack,
    maskCanvasRef,
  };

  return (
    <MaskContext.Provider value={value}>
      {/* Hidden canvas for mask editing */}
      <canvas ref={maskCanvasRef} style={{ display: "none" }} />
      {children}
    </MaskContext.Provider>
  );
}

export function useMask() {
  const context = useContext(MaskContext);
  if (!context) {
    throw new Error("useMask must be used within MaskProvider");
  }
  return context;
}
