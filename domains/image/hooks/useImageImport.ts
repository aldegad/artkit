"use client";

import { useCallback, type ChangeEvent, type DragEvent } from "react";
import { CropArea, Point, UnifiedLayer, createPaintLayer } from "../types";

interface UseImageImportOptions {
  layersCount: number;
  addImageLayer: (imageSrc: string, name?: string) => void;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setRotation: (rotation: number) => void;
  setCropArea: React.Dispatch<React.SetStateAction<CropArea | null>>;
  setZoom: (zoom: number | ((z: number) => number)) => void;
  setPan: (pan: Point | ((p: Point) => Point)) => void;
  setStampSource: React.Dispatch<React.SetStateAction<Point | null>>;
}

interface UseImageImportReturn {
  loadImageFile: (file: File) => void;
  loadImageFiles: (files: File[]) => void;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: DragEvent) => void;
  handleDragOver: (e: DragEvent) => void;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result;
      resolve(typeof src === "string" ? src : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function loadImageFromSrc(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function useImageImport(options: UseImageImportOptions): UseImageImportReturn {
  const {
    layersCount,
    addImageLayer,
    layerCanvasesRef,
    editCanvasRef,
    imageRef,
    setLayers,
    setActiveLayerId,
    setCanvasSize,
    setRotation,
    setCropArea,
    setZoom,
    setPan,
    setStampSource,
  } = options;

  const loadImageFiles = useCallback(
    (files: File[]) => {
      void (async () => {
        const imageFiles = files.filter(isImageFile);
        if (imageFiles.length === 0) return;

        let shouldInitializeCanvas = layersCount === 0;

        for (const file of imageFiles) {
          const src = await readFileAsDataUrl(file);
          if (!src) continue;

          const fileName = file.name.replace(/\.[^/.]+$/, "");

          if (shouldInitializeCanvas) {
            const img = await loadImageFromSrc(src);
            if (!img) continue;

            setRotation(0);
            setCropArea(null);
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setStampSource(null);
            imageRef.current = img;
            setCanvasSize({ width: img.width, height: img.height });

            const imageLayer = createPaintLayer(fileName || "Layer 1", 0);
            imageLayer.originalSize = { width: img.width, height: img.height };

            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
            }

            layerCanvasesRef.current.set(imageLayer.id, canvas);
            editCanvasRef.current = canvas;
            setLayers([imageLayer]);
            setActiveLayerId(imageLayer.id);
            shouldInitializeCanvas = false;
            continue;
          }

          addImageLayer(src, fileName || undefined);
        }
      })();
    },
    [
      layersCount,
      addImageLayer,
      layerCanvasesRef,
      editCanvasRef,
      imageRef,
      setLayers,
      setActiveLayerId,
      setCanvasSize,
      setRotation,
      setCropArea,
      setZoom,
      setPan,
      setStampSource,
    ]
  );

  const loadImageFile = useCallback(
    (file: File) => {
      loadImageFiles([file]);
    },
    [loadImageFiles]
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) loadImageFiles(files);
      e.currentTarget.value = "";
    },
    [loadImageFiles]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) loadImageFiles(files);
    },
    [loadImageFiles]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  return {
    loadImageFile,
    loadImageFiles,
    handleFileSelect,
    handleDrop,
    handleDragOver,
  };
}
