"use client";

import {
  createContext,
  useContext,
  useRef,
  ReactNode,
  RefObject,
} from "react";
import type { AspectRatio } from "@/shared/types/aspectRatio";

export interface PreviewTransformState {
  isActive: boolean;
  clipId: string | null;
  aspectRatio: AspectRatio;
}

// Imperative API exposed by PreviewCanvas for toolbar zoom controls
export interface PreviewViewportAPI {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToContainer: () => void;
  getZoom: () => number;
  setZoom: (z: number) => void;
  onZoomChange: (cb: (zoom: number) => void) => () => void;
  startTransformForSelection: () => boolean;
  applyTransform: () => void;
  cancelTransform: () => void;
  setTransformAspectRatio: (ratio: AspectRatio) => void;
  nudgeTransform: (dx: number, dy: number) => boolean;
  getTransformState: () => PreviewTransformState;
  onTransformChange: (cb: (state: PreviewTransformState) => void) => () => void;
}

interface VideoRefsContextValue {
  // Preview canvas
  previewCanvasRef: RefObject<HTMLCanvasElement | null>;
  previewContainerRef: RefObject<HTMLDivElement | null>;
  previewViewportRef: RefObject<PreviewViewportAPI | null>;

  // Timeline canvas
  timelineCanvasRef: RefObject<HTMLCanvasElement | null>;
  timelineContainerRef: RefObject<HTMLDivElement | null>;

  // Mask editing canvas (offscreen)
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;

  // Compositing canvas (offscreen for layer compositing)
  compositingCanvasRef: RefObject<HTMLCanvasElement | null>;

  // Video element pool for frame extraction
  videoElementsRef: RefObject<Map<string, HTMLVideoElement>>;

  // Audio element pool for timeline audio clips
  audioElementsRef: RefObject<Map<string, HTMLAudioElement>>;
}

const VideoRefsContext = createContext<VideoRefsContextValue | null>(null);

export function VideoRefsProvider({ children }: { children: ReactNode }) {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<PreviewViewportAPI | null>(null);
  const timelineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const value: VideoRefsContextValue = {
    previewCanvasRef,
    previewContainerRef,
    previewViewportRef,
    timelineCanvasRef,
    timelineContainerRef,
    maskCanvasRef,
    compositingCanvasRef,
    videoElementsRef,
    audioElementsRef,
  };

  return (
    <VideoRefsContext.Provider value={value}>
      {children}
    </VideoRefsContext.Provider>
  );
}

export function useVideoRefs() {
  const context = useContext(VideoRefsContext);
  if (!context) {
    throw new Error("useVideoRefs must be used within VideoRefsProvider");
  }
  return context;
}
