"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import {
  MaskData,
  MaskKeyframe,
  MaskBrushSettings,
  DEFAULT_MASK_BRUSH,
  createMaskData,
} from "../types";
import { Size } from "@/shared/types";
import { applyEasing } from "../utils/maskStorage";

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

  // Mask data
  masks: Map<string, MaskData>;

  // Actions
  selectMask: (maskId: string) => void;
  deselectMask: () => void;
  startMaskEdit: (trackId: string, canvasSize: Size, currentTime: number) => string;
  endMaskEdit: () => void;
  addMask: (trackId: string, size: Size, startTime: number, duration: number) => string;
  deleteMask: (maskId: string) => void;
  updateMaskTime: (maskId: string, startTime: number, duration: number) => void;
  getMasksForTrack: (trackId: string) => MaskData[];
  getMaskAtTimeForTrack: (trackId: string, time: number) => string | null;

  // Keyframe operations
  addKeyframe: (maskId: string, time: number, maskData: string) => void;
  removeKeyframe: (maskId: string, keyframeId: string) => void;
  updateKeyframe: (maskId: string, keyframeId: string, updates: Partial<MaskKeyframe>) => void;

  // Get interpolated mask at time (relative to mask start)
  getMaskAtTime: (maskId: string, localTime: number) => string | null;

  // Refs for drawing
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  tempCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const MaskContext = createContext<MaskContextValue | null>(null);

export function MaskProvider({ children }: { children: ReactNode }) {
  const [masks, setMasks] = useState<Map<string, MaskData>>(new Map());
  const [activeMaskId, setActiveMaskId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isEditingMask, setIsEditingMask] = useState(false);
  const [brushSettings, setBrushSettingsState] = useState<MaskBrushSettings>(DEFAULT_MASK_BRUSH);

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

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

  // Select a mask (highlight without entering edit mode)
  const selectMask = useCallback((maskId: string) => {
    const mask = masks.get(maskId);
    if (!mask) return;
    setActiveMaskId(maskId);
    setActiveTrackId(mask.trackId);
  }, [masks]);

  // Deselect mask
  const deselectMask = useCallback(() => {
    if (isEditingMask) return; // don't deselect while editing
    setActiveMaskId(null);
    setActiveTrackId(null);
  }, [isEditingMask]);

  // Create a new mask for a track
  const addMask = useCallback((trackId: string, size: Size, startTime: number, duration: number): string => {
    const mask = createMaskData(trackId, size, startTime, duration);
    setMasks((prev) => {
      const next = new Map(prev);
      next.set(mask.id, mask);
      return next;
    });
    return mask.id;
  }, []);

  // Delete a mask
  const deleteMask = useCallback((maskId: string) => {
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
  }, [activeMaskId]);

  // Update mask time range
  const updateMaskTime = useCallback((maskId: string, startTime: number, duration: number) => {
    setMasks((prev) => {
      const mask = prev.get(maskId);
      if (!mask) return prev;
      const next = new Map(prev);
      next.set(maskId, { ...mask, startTime, duration });
      return next;
    });
  }, []);

  // Get all masks for a track
  const getMasksForTrack = useCallback(
    (trackId: string): MaskData[] => {
      const result: MaskData[] = [];
      for (const mask of masks.values()) {
        if (mask.trackId === trackId) {
          result.push(mask);
        }
      }
      return result.sort((a, b) => a.startTime - b.startTime);
    },
    [masks]
  );

  // Start editing a mask
  const startMaskEdit = useCallback(
    (trackId: string, canvasSize: Size, currentTime: number): string => {
      // Find existing mask at current time on this track, or create new one
      let mask: MaskData | null = null;
      for (const m of masks.values()) {
        if (m.trackId === trackId && currentTime >= m.startTime && currentTime < m.startTime + m.duration) {
          mask = m;
          break;
        }
      }

      if (!mask) {
        // Create new mask at current time with 5s default duration
        const maskId = addMask(trackId, canvasSize, currentTime, 5);
        mask = { ...createMaskData(trackId, canvasSize, currentTime, 5), id: maskId };
      }

      setActiveMaskId(mask.id);
      setActiveTrackId(trackId);
      setIsEditingMask(true);

      // Initialize mask canvas
      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = canvasSize.width;
        maskCanvasRef.current.height = canvasSize.height;
        const ctx = maskCanvasRef.current.getContext("2d");
        if (ctx) {
          // Start fully transparent (alpha=0) — clip invisible until painted
          ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

          // Load existing keyframe data if available
          const localTime = currentTime - mask.startTime;
          const existingData = getMaskAtTimeInternal(mask, localTime);
          if (existingData) {
            const img = new Image();
            img.onload = () => {
              ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
              ctx.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
            };
            img.src = existingData;
          }
        }
      }

      return mask.id;
    },
    [masks, addMask]
  );

  // End mask editing
  const endMaskEdit = useCallback(() => {
    setActiveMaskId(null);
    setActiveTrackId(null);
    setIsEditingMask(false);
  }, []);

  // Add a keyframe (time is relative to mask start)
  const addKeyframe = useCallback(
    (maskId: string, time: number, maskData: string) => {
      setMasks((prev) => {
        const mask = prev.get(maskId);
        if (!mask) return prev;

        const keyframe: MaskKeyframe = {
          id: crypto.randomUUID(),
          time,
          maskData,
          easing: "linear",
        };

        const keyframes = mask.keyframes || [];
        // Remove existing keyframe at same time
        const filtered = keyframes.filter((k) => Math.abs(k.time - time) > 0.01);
        // Add new keyframe and sort
        const updated = [...filtered, keyframe].sort((a, b) => a.time - b.time);

        const next = new Map(prev);
        next.set(maskId, { ...mask, keyframes: updated });
        return next;
      });
    },
    []
  );

  // Remove a keyframe
  const removeKeyframe = useCallback((maskId: string, keyframeId: string) => {
    setMasks((prev) => {
      const mask = prev.get(maskId);
      if (!mask) return prev;

      const next = new Map(prev);
      next.set(maskId, {
        ...mask,
        keyframes: mask.keyframes.filter((k) => k.id !== keyframeId),
      });
      return next;
    });
  }, []);

  // Update a keyframe
  const updateKeyframe = useCallback(
    (maskId: string, keyframeId: string, updates: Partial<MaskKeyframe>) => {
      setMasks((prev) => {
        const mask = prev.get(maskId);
        if (!mask) return prev;

        const next = new Map(prev);
        next.set(maskId, {
          ...mask,
          keyframes: mask.keyframes.map((k) =>
            k.id === keyframeId ? { ...k, ...updates } : k
          ),
        });
        return next;
      });
    },
    []
  );

  // Internal helper: get interpolated mask at local time
  function getMaskAtTimeInternal(mask: MaskData, localTime: number): string | null {
    if (!mask.keyframes || mask.keyframes.length === 0) return null;

    const keyframes = mask.keyframes;

    // Exact match
    const exact = keyframes.find((k) => Math.abs(k.time - localTime) < 0.01);
    if (exact) return exact.maskData;

    // Before first keyframe
    if (localTime < keyframes[0].time) return keyframes[0].maskData;

    // After last keyframe
    if (localTime > keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].maskData;

    // Find surrounding keyframes
    let before = keyframes[0];
    let after = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (keyframes[i].time <= localTime && keyframes[i + 1].time >= localTime) {
        before = keyframes[i];
        after = keyframes[i + 1];
        break;
      }
    }

    const timeRange = Math.max(after.time - before.time, 0.0001);
    const linearT = Math.max(0, Math.min(1, (localTime - before.time) / timeRange));
    const easedT = applyEasing(linearT, after.easing);

    if (easedT <= 0) return before.maskData;
    if (easedT >= 1) return after.maskData;

    // Blend
    const getCachedImage = (dataUrl: string): HTMLImageElement | null => {
      const cached = maskImageCacheRef.current.get(dataUrl);
      if (cached) return cached.complete ? cached : null;
      const img = new Image();
      img.src = dataUrl;
      maskImageCacheRef.current.set(dataUrl, img);
      return null;
    };

    const beforeImage = getCachedImage(before.maskData);
    const afterImage = getCachedImage(after.maskData);
    if (!beforeImage || !afterImage) {
      return easedT < 0.5 ? before.maskData : after.maskData;
    }

    const blendCanvas = tempCanvasRef.current || document.createElement("canvas");
    blendCanvas.width = mask.size.width;
    blendCanvas.height = mask.size.height;

    const ctx = blendCanvas.getContext("2d");
    if (!ctx) return easedT < 0.5 ? before.maskData : after.maskData;

    ctx.clearRect(0, 0, blendCanvas.width, blendCanvas.height);
    ctx.globalAlpha = 1;
    ctx.drawImage(beforeImage, 0, 0, blendCanvas.width, blendCanvas.height);
    ctx.globalAlpha = easedT;
    ctx.drawImage(afterImage, 0, 0, blendCanvas.width, blendCanvas.height);
    ctx.globalAlpha = 1;

    return blendCanvas.toDataURL("image/png");
  }

  // Public: get interpolated mask at local time (relative to mask start)
  const getMaskAtTime = useCallback(
    (maskId: string, localTime: number): string | null => {
      const mask = masks.get(maskId);
      if (!mask) return null;
      return getMaskAtTimeInternal(mask, localTime);
    },
    [masks]
  );

  // Get mask data for a track at an absolute timeline time
  const getMaskAtTimeForTrack = useCallback(
    (trackId: string, time: number): string | null => {
      for (const mask of masks.values()) {
        if (mask.trackId !== trackId) continue;
        if (time < mask.startTime || time >= mask.startTime + mask.duration) continue;

        // Currently editing this mask - use live canvas
        if (isEditingMask && activeMaskId === mask.id && maskCanvasRef.current) {
          return "__live_canvas__"; // Signal to use maskCanvasRef directly
        }

        const localTime = time - mask.startTime;
        return getMaskAtTimeInternal(mask, localTime);
      }
      return null;
    },
    [masks, isEditingMask, activeMaskId]
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
    masks,
    selectMask,
    deselectMask,
    startMaskEdit,
    endMaskEdit,
    addMask,
    deleteMask,
    updateMaskTime,
    getMasksForTrack,
    getMaskAtTimeForTrack,
    addKeyframe,
    removeKeyframe,
    updateKeyframe,
    getMaskAtTime,
    maskCanvasRef,
    tempCanvasRef,
  };

  return (
    <MaskContext.Provider value={value}>
      {/* Hidden canvases for mask editing */}
      <canvas ref={maskCanvasRef} style={{ display: "none" }} />
      <canvas ref={tempCanvasRef} style={{ display: "none" }} />
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
