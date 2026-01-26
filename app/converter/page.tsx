"use client";

import { useState, useCallback, useRef } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import SettingsMenu from "../../components/SettingsMenu";
import ImageDropZone from "../../components/ImageDropZone";

interface ImageFile {
  id: string;
  file: File;
  originalUrl: string;
  originalSize: number;
  width: number;
  height: number;
  convertedUrl?: string;
  convertedSize?: number;
  convertedBlob?: Blob;
}

type OutputFormat = "webp" | "jpeg" | "png";

export default function ImageConverter() {
  const { t } = useLanguage();
  const [images, setImages] = useState<ImageFile[]>([]);
  const [quality, setQuality] = useState(0.8);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("webp");
  const [isConverting, setIsConverting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          };
          setImages((prev) => [...prev, newImage]);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const convertImage = useCallback(
    async (image: ImageFile): Promise<ImageFile> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(image);
            return;
          }

          ctx.drawImage(img, 0, 0);

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
    [quality, outputFormat],
  );

  const convertAll = useCallback(async () => {
    setIsConverting(true);
    const converted = await Promise.all(images.map(convertImage));
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

  const downloadAll = useCallback(() => {
    images.forEach((image) => {
      if (image.convertedBlob) {
        downloadImage(image);
      }
    });
  }, [images, downloadImage]);

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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const totalOriginalSize = images.reduce((acc, img) => acc + img.originalSize, 0);
  const totalConvertedSize = images.reduce((acc, img) => acc + (img.convertedSize || 0), 0);
  const hasConverted = images.some((img) => img.convertedUrl);

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-primary border-b border-border-default shrink-0 shadow-sm h-12">
        <h1 className="text-sm font-semibold">{t.imageConverter}</h1>

        <div className="h-6 w-px bg-border-default" />

        {/* Format selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">{t.format}:</span>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
            className="px-3 py-1.5 bg-surface-secondary border border-border-default rounded-lg text-sm focus:outline-none focus:border-accent-primary"
          >
            <option value="webp">WebP</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>
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

        <div className="h-6 w-px bg-border-default" />

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
            className="px-4 py-1.5 bg-accent-success hover:bg-accent-success/80 text-white rounded-lg text-sm transition-colors"
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

        <div className="h-5 w-px bg-border-default" />

        <SettingsMenu />
      </div>

      {/* Main Content */}
      <div className={`flex-1 overflow-auto bg-surface-secondary relative ${images.length > 0 ? "p-4" : ""}`}>
        {images.length === 0 ? (
          <ImageDropZone variant="converter" onFileSelect={addFiles} />
        ) : (
          /* Image grid */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {images.map((image) => (
              <div
                key={image.id}
                className="bg-surface-secondary rounded-xl overflow-hidden border border-border-default"
              >
                {/* Preview */}
                <div className="aspect-square bg-surface-tertiary relative">
                  <img
                    src={image.convertedUrl || image.originalUrl}
                    alt=""
                    className="w-full h-full object-contain"
                  />
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
                    {image.width} × {image.height}
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
            <div
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square border-2 border-dashed border-border-default rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-accent-primary hover:bg-surface-secondary/50 transition-colors"
            >
              <svg
                className="w-8 h-8 text-text-tertiary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="text-sm text-text-tertiary">{t.addMore}</span>
            </div>
          </div>
        )}
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
