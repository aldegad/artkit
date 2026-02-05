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

interface MaskContextValue {
  // Current mask being edited
  activeMaskId: string | null;
  activeClipId: string | null;
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
  startMaskEdit: (clipId: string, size: Size) => string;
  endMaskEdit: () => void;
  createMask: (clipId: string, size: Size) => string;
  deleteMask: (maskId: string) => void;
  getMaskForClip: (clipId: string) => MaskData | null;

  // Keyframe operations
  addKeyframe: (maskId: string, time: number, maskData: string) => void;
  removeKeyframe: (maskId: string, keyframeId: string) => void;
  updateKeyframe: (maskId: string, keyframeId: string, updates: Partial<MaskKeyframe>) => void;

  // Get interpolated mask at time
  getMaskAtTime: (maskId: string, time: number) => string | null;

  // Refs for drawing
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  tempCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const MaskContext = createContext<MaskContextValue | null>(null);

export function MaskProvider({ children }: { children: ReactNode }) {
  const [masks, setMasks] = useState<Map<string, MaskData>>(new Map());
  const [activeMaskId, setActiveMaskId] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [isEditingMask, setIsEditingMask] = useState(false);
  const [brushSettings, setBrushSettingsState] = useState<MaskBrushSettings>(DEFAULT_MASK_BRUSH);

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Create a new mask for a clip
  const createMask = useCallback((clipId: string, size: Size): string => {
    const mask = createMaskData(clipId, size, "keyframed");
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
      setActiveClipId(null);
      setIsEditingMask(false);
    }
  }, [activeMaskId]);

  // Get mask for a clip
  const getMaskForClip = useCallback(
    (clipId: string): MaskData | null => {
      for (const mask of masks.values()) {
        if (mask.clipId === clipId) {
          return mask;
        }
      }
      return null;
    },
    [masks]
  );

  // Start editing a mask
  const startMaskEdit = useCallback(
    (clipId: string, size: Size): string => {
      let mask = getMaskForClip(clipId);
      if (!mask) {
        const maskId = createMask(clipId, size);
        mask = { ...createMaskData(clipId, size), id: maskId };
      }

      setActiveMaskId(mask.id);
      setActiveClipId(clipId);
      setIsEditingMask(true);

      // Initialize mask canvas
      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = size.width;
        maskCanvasRef.current.height = size.height;
        const ctx = maskCanvasRef.current.getContext("2d");
        if (ctx) {
          // Start with fully opaque (white = visible)
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size.width, size.height);
        }
      }

      return mask.id;
    },
    [getMaskForClip, createMask]
  );

  // End mask editing
  const endMaskEdit = useCallback(() => {
    setActiveMaskId(null);
    setActiveClipId(null);
    setIsEditingMask(false);
  }, []);

  // Add a keyframe
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
      if (!mask || !mask.keyframes) return prev;

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
        if (!mask || !mask.keyframes) return prev;

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

  // Get interpolated mask at time (returns base64)
  const getMaskAtTime = useCallback(
    (maskId: string, time: number): string | null => {
      const mask = masks.get(maskId);
      if (!mask || !mask.keyframes || mask.keyframes.length === 0) {
        return null;
      }

      const keyframes = mask.keyframes;

      // Exact match
      const exact = keyframes.find((k) => Math.abs(k.time - time) < 0.01);
      if (exact) return exact.maskData;

      // Before first keyframe
      if (time < keyframes[0].time) {
        return keyframes[0].maskData;
      }

      // After last keyframe
      if (time > keyframes[keyframes.length - 1].time) {
        return keyframes[keyframes.length - 1].maskData;
      }

      // Find surrounding keyframes
      let before = keyframes[0];
      let after = keyframes[keyframes.length - 1];

      for (let i = 0; i < keyframes.length - 1; i++) {
        if (keyframes[i].time <= time && keyframes[i + 1].time >= time) {
          before = keyframes[i];
          after = keyframes[i + 1];
          break;
        }
      }

      // For now, just return the "before" keyframe
      // TODO: Implement actual interpolation between mask images
      return before.maskData;
    },
    [masks]
  );

  const value: MaskContextValue = {
    activeMaskId,
    activeClipId,
    isEditingMask,
    brushSettings,
    setBrushSettings,
    setBrushSize,
    setBrushHardness,
    setBrushMode,
    masks,
    startMaskEdit,
    endMaskEdit,
    createMask,
    deleteMask,
    getMaskForClip,
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
