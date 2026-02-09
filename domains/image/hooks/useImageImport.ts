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
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: DragEvent) => void;
  handleDragOver: (e: DragEvent) => void;
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

  const loadImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result;
        if (typeof src !== "string") return;

        const fileName = file.name.replace(/\.[^/.]+$/, "");

        if (layersCount === 0) {
          setRotation(0);
          setCropArea(null);
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setStampSource(null);

          const img = new Image();
          img.onload = () => {
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
          };
          img.src = src;
          return;
        }

        addImageLayer(src, fileName || undefined);
      };
      reader.readAsDataURL(file);
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

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadImageFile(file);
      e.currentTarget.value = "";
    },
    [loadImageFile]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) loadImageFile(file);
    },
    [loadImageFile]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  return {
    loadImageFile,
    handleFileSelect,
    handleDrop,
    handleDragOver,
  };
}
