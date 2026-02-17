"use client";

import { useState, useCallback, useRef } from "react";
import { useLanguage } from "@/shared/contexts";
import { ImageDropZone, Select, HeaderContent, Scrollbar } from "@/shared/components";
import { PlusIcon, FlipIcon, RotateIcon } from "@/shared/components/icons";
import { downloadBlob } from "@/shared/utils/download";
import { OutputFormat, ImageFile, formatBytes } from "@/domains/converter";

export default function ImageConverter() {
  const { t } = useLanguage();
  const [images, setImages] = useState<ImageFile[]>([]);
  const [quality, setQuality] = useState(0.8);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("webp");
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [maxSidePx, setMaxSidePx] = useState(1024);
  const [isConverting, setIsConverting] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = useCallback(() => {
    if (!fileInputRef.current) return;
    // Ensure selecting the same file again still triggers onChange.
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const addFiles = useCallback((files: File[]) => {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const newImage: ImageFile = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            originalUrl: url,
            originalSize: file.size,
            width: img.width,
            height: img.height,
            rotation: 0,
            flipX: false,
          };
          setImages((prev) => [...prev, newImage]);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const normalizeRotation = useCallback((rotation: number) => {
    return ((Math.round(rotation) % 360) + 360) % 360;
  }, []);

  const clearConvertedData = useCallback((image: ImageFile): ImageFile => {
    if (image.convertedUrl) {
      URL.revokeObjectURL(image.convertedUrl);
    }
    return {
      ...image,
      convertedUrl: undefined,
      convertedSize: undefined,
      convertedBlob: undefined,
      convertedWidth: undefined,
      convertedHeight: undefined,
    };
  }, []);

  const updateImageTransform = useCallback(
    (id: string, updater: (image: ImageFile) => ImageFile) => {
      setImages((prev) =>
        prev.map((image) => {
          if (image.id !== id) return image;
          const next = updater(image);
          return clearConvertedData(next);
        }),
      );
    },
    [clearConvertedData],
  );

  const handleFlipImage = useCallback(
    (id: string) => {
      updateImageTransform(id, (image) => ({
        ...image,
        flipX: !image.flipX,
      }));
    },
    [updateImageTransform],
  );

  const handleRotateImage = useCallback(
    (id: string) => {
      updateImageTransform(id, (image) => ({
        ...image,
        rotation: normalizeRotation(image.rotation + 90),
      }));
    },
    [normalizeRotation, updateImageTransform],
  );

  const getTargetSize = useCallback(
    (width: number, height: number) => {
      if (!resizeEnabled) {
        return { width, height };
      }

      const targetMaxSide = Math.max(1, Math.round(maxSidePx));
      const sourceMaxSide = Math.max(width, height);
      if (sourceMaxSide <= targetMaxSide) {
        return { width, height };
      }

      const scale = targetMaxSide / sourceMaxSide;
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      };
    },
    [maxSidePx, resizeEnabled],
  );

  const convertImage = useCallback(
    async (image: ImageFile): Promise<ImageFile> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const rotation = normalizeRotation(image.rotation);
          const isQuarterTurn = rotation % 180 !== 0;
          const transformedWidth = isQuarterTurn ? img.height : img.width;
          const transformedHeight = isQuarterTurn ? img.width : img.height;
          const targetSize = getTargetSize(transformedWidth, transformedHeight);
          const canvas = document.createElement("canvas");
          canvas.width = targetSize.width;
          canvas.height = targetSize.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(image);
            return;
          }

          const drawWidth = isQuarterTurn ? targetSize.height : targetSize.width;
          const drawHeight = isQuarterTurn ? targetSize.width : targetSize.height;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.save();
          ctx.translate(targetSize.width / 2, targetSize.height / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.scale(image.flipX ? -1 : 1, 1);
          ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          ctx.restore();

          const mimeType =
            outputFormat === "webp"
              ? "image/webp"
              : outputFormat === "jpeg"
                ? "image/jpeg"
                : "image/png";

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const convertedUrl = URL.createObjectURL(blob);
                resolve({
                  ...image,
                  convertedUrl,
                  convertedSize: blob.size,
                  convertedWidth: targetSize.width,
                  convertedHeight: targetSize.height,
                  convertedBlob: blob,
                });
              } else {
                resolve(image);
              }
            },
            mimeType,
            quality,
          );
        };
        img.src = image.originalUrl;
      });
    },
    [getTargetSize, normalizeRotation, quality, outputFormat],
  );

  const convertAll = useCallback(async () => {
    setIsConverting(true);
    const converted = await Promise.all(images.map(convertImage));
    images.forEach((image) => {
      if (image.convertedUrl) URL.revokeObjectURL(image.convertedUrl);
    });
    setImages(converted);
    setIsConverting(false);
  }, [images, convertImage]);

  const downloadImage = useCallback(
    (image: ImageFile) => {
      if (!image.convertedBlob) return;

      const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
      const originalName = image.file.name.replace(/\.[^/.]+$/, "");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(image.convertedBlob);
      link.download = `${originalName}.${ext}`;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    [outputFormat],
  );

  const downloadAll = useCallback(async () => {
    if (isDownloadingAll) return;

    const convertedImages = images.filter((image) => Boolean(image.convertedBlob));
    if (convertedImages.length === 0) return;

    setIsDownloadingAll(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
      const duplicateNameCounter = new Map<string, number>();

      convertedImages.forEach((image, index) => {
        const blob = image.convertedBlob;
        if (!blob) return;

        const baseName = image.file.name.replace(/\.[^/.]+$/, "") || `image-${index + 1}`;
        const key = baseName.toLowerCase();
        const duplicateCount = duplicateNameCounter.get(key) ?? 0;
        duplicateNameCounter.set(key, duplicateCount + 1);

        const uniqueName = duplicateCount === 0
          ? baseName
          : `${baseName}-${duplicateCount + 1}`;

        zip.file(`${uniqueName}.${ext}`, blob);
      });

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadBlob(zipBlob, `converted-images-${timestamp}.zip`);
    } catch (error) {
      console.error("Failed to download all as zip:", error);
    } finally {
      setIsDownloadingAll(false);
    }
  }, [images, isDownloadingAll, outputFormat]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const image = prev.find((i) => i.id === id);
      if (image?.originalUrl) URL.revokeObjectURL(image.originalUrl);
      if (image?.convertedUrl) URL.revokeObjectURL(image.convertedUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    images.forEach((image) => {
      if (image.originalUrl) URL.revokeObjectURL(image.originalUrl);
      if (image.convertedUrl) URL.revokeObjectURL(image.convertedUrl);
    });
    setImages([]);
  }, [images]);

  const handleContentDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleContentDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files || []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles],
  );

  // formatBytes is imported from domain

  const totalOriginalSize = images.reduce((acc, img) => acc + img.originalSize, 0);
  const totalConvertedSize = images.reduce((acc, img) => acc + (img.convertedSize || 0), 0);
  const hasConverted = images.some((img) => img.convertedUrl);

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Header Slot */}
      <HeaderContent
        title={t.imageConverter}
        info={images.length > 0 ? (
          <span className="text-xs text-text-secondary whitespace-nowrap">
            {images.length} {t.files}
          </span>
        ) : undefined}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-primary border-b border-border-default shrink-0 shadow-sm">

        {/* Format selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">{t.format}:</span>
          <Select
            value={outputFormat}
            onChange={(value) => setOutputFormat(value as OutputFormat)}
            options={[
              { value: "webp", label: "WebP" },
              { value: "jpeg", label: "JPEG" },
              { value: "png", label: "PNG" },
            ]}
            size="md"
          />
        </div>

        {/* Quality slider */}
        {outputFormat !== "png" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">{t.quality}:</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="w-24 accent-accent-primary"
            />
            <span className="text-sm w-10">{Math.round(quality * 100)}%</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={resizeEnabled}
              onChange={(e) => setResizeEnabled(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-accent-primary"
            />
            {t.resize}
          </label>
          {resizeEnabled && (
            <>
              <span className="text-sm text-text-secondary">{t.maxSidePx}:</span>
              <input
                type="number"
                min={1}
                step={1}
                value={maxSidePx}
                onChange={(e) => setMaxSidePx(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                className="w-20 px-2 py-1 bg-surface-secondary border border-border-default rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              />
              <span className="text-xs text-text-tertiary">px</span>
            </>
          )}
        </div>

        <div className="h-6 w-px bg-border-default" />

        <button
          onClick={openFilePicker}
          className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-text-primary rounded-lg text-sm transition-colors"
        >
          {t.addMore}
        </button>

        <button
          onClick={convertAll}
          disabled={images.length === 0 || isConverting}
          className="px-4 py-1.5 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
        >
          {isConverting ? t.converting : t.convertAll}
        </button>

        {hasConverted && (
          <button
            onClick={downloadAll}
            disabled={isDownloadingAll}
            className="px-4 py-1.5 bg-accent-success hover:bg-accent-success/80 disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
          >
            {t.downloadAll}
          </button>
        )}

        {images.length > 0 && (
          <button
            onClick={clearAll}
            className="px-4 py-1.5 bg-accent-danger hover:bg-accent-danger-hover text-white rounded-lg text-sm transition-colors"
          >
            {t.clear}
          </button>
        )}

        <div className="flex-1" />

        {/* Stats */}
        {images.length > 0 && (
          <div className="text-sm text-text-secondary">
            {images.length} {t.files}
            {hasConverted && (
              <>
                {" · "}
                <span className="text-text-primary">{formatBytes(totalOriginalSize)}</span>
                {" → "}
                <span
                  className={
                    totalConvertedSize < totalOriginalSize
                      ? "text-accent-success"
                      : "text-accent-danger"
                  }
                >
                  {formatBytes(totalConvertedSize)}
                </span>
                {" ("}
                {totalOriginalSize > 0
                  ? Math.round((1 - totalConvertedSize / totalOriginalSize) * 100)
                  : 0}
                {"% saved)"}
              </>
            )}
          </div>
        )}

        </div>

      {/* Main Content */}
      <div
        className="flex-1 bg-surface-secondary relative min-h-0"
        onDragOver={handleContentDragOver}
        onDrop={handleContentDrop}
      >
        <Scrollbar
          className={`h-full ${images.length > 0 ? "p-4" : ""}`}
          overflow={{ x: "hidden", y: "scroll" }}
        >
          {images.length === 0 ? (
            <ImageDropZone variant="converter" onFileSelect={addFiles} />
          ) : (
            /* Image grid */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {images.map((image) => (
                <div key={image.id} className="bg-surface-secondary rounded-xl overflow-hidden border border-border-default">
                  {/* Preview */}
                  <div className="aspect-square bg-surface-tertiary relative">
                    <img
                      src={image.convertedUrl || image.originalUrl}
                      alt=""
                      className="w-full h-full object-contain"
                      style={{
                        transform: `rotate(${normalizeRotation(image.rotation)}deg) scaleX(${image.flipX ? -1 : 1})`,
                      }}
                    />
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <button
                        onClick={() => handleFlipImage(image.id)}
                        className="w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-md flex items-center justify-center transition-colors"
                        title={t.flipHorizontal}
                      >
                        <FlipIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRotateImage(image.id)}
                        className="w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-md flex items-center justify-center transition-colors"
                        title={`${t.rotate} 90°`}
                      >
                        <RotateIcon className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Remove button */}
                    <button
                      onClick={() => removeImage(image.id)}
                      className="absolute top-2 right-2 w-6 h-6 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-sm transition-colors"
                    >
                      ×
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm truncate text-text-primary" title={image.file.name}>
                      {image.file.name}
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">
                      {(normalizeRotation(image.rotation) % 180 === 0 ? image.width : image.height)} ×
                      {" "}
                      {(normalizeRotation(image.rotation) % 180 === 0 ? image.height : image.width)}
                      {typeof image.convertedWidth === "number" && typeof image.convertedHeight === "number"
                        ? ` → ${image.convertedWidth} × ${image.convertedHeight}`
                        : ""}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <span className="text-text-secondary">{formatBytes(image.originalSize)}</span>
                      {image.convertedSize !== undefined && (
                        <>
                          <span className="text-text-tertiary">→</span>
                          <span
                            className={
                              image.convertedSize < image.originalSize
                                ? "text-accent-success font-medium"
                                : "text-accent-danger font-medium"
                            }
                          >
                            {formatBytes(image.convertedSize)}
                          </span>
                          <span className="text-text-tertiary">
                            ({Math.round((1 - image.convertedSize / image.originalSize) * 100)}
                            %)
                          </span>
                        </>
                      )}
                    </div>

                    {/* Download button */}
                    {image.convertedBlob && (
                      <button
                        onClick={() => downloadImage(image)}
                        className="w-full mt-3 px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-xs transition-colors"
                      >
                        {t.download}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add more button */}
              <button
                type="button"
                onClick={openFilePicker}
                className="aspect-square border-2 border-dashed border-border-default rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-accent-primary hover:bg-surface-secondary/50 transition-colors"
              >
                <PlusIcon className="w-8 h-8 text-text-tertiary" />
                <span className="text-sm text-text-tertiary">{t.addMore}</span>
              </button>
            </div>
          )}
        </Scrollbar>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
