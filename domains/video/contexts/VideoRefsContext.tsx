"use client";

import {
  createContext,
  useContext,
  useRef,
  ReactNode,
  RefObject,
} from "react";

interface VideoRefsContextValue {
  // Preview canvas
  previewCanvasRef: RefObject<HTMLCanvasElement | null>;
  previewContainerRef: RefObject<HTMLDivElement | null>;

  // Timeline canvas
  timelineCanvasRef: RefObject<HTMLCanvasElement | null>;
  timelineContainerRef: RefObject<HTMLDivElement | null>;

  // Mask editing canvas (offscreen)
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;

  // Compositing canvas (offscreen for layer compositing)
  compositingCanvasRef: RefObject<HTMLCanvasElement | null>;

  // Video element pool for frame extraction
  videoElementsRef: RefObject<Map<string, HTMLVideoElement>>;
}

const VideoRefsContext = createContext<VideoRefsContextValue | null>(null);

export function VideoRefsProvider({ children }: { children: ReactNode }) {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const value: VideoRefsContextValue = {
    previewCanvasRef,
    previewContainerRef,
    timelineCanvasRef,
    timelineContainerRef,
    maskCanvasRef,
    compositingCanvasRef,
    videoElementsRef,
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
