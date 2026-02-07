/**
 * Canvas Caching System
 *
 * Provides cached canvases for frequently used patterns and temporary operations.
 * Reduces GC pressure by reusing canvas elements instead of creating new ones.
 */

interface CachedCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastUsed: number;
  key: string;
}

class CanvasCacheImpl {
  private cache = new Map<string, CachedCanvas>();
  private checkerboardPatterns = new Map<string, CanvasPattern>();
  private readonly maxCacheSize = 20;
  private readonly maxAge = 60000; // 1 minute

  /**
   * Get or create a checkerboard pattern canvas
   * Patterns are cached for reuse across renders
   */
  getCheckerboardPattern(
    ctx: CanvasRenderingContext2D,
    size: number,
    lightColor: string,
    darkColor: string
  ): CanvasPattern | null {
    const key = `checker-${size}-${lightColor}-${darkColor}`;

    if (this.checkerboardPatterns.has(key)) {
      return this.checkerboardPatterns.get(key)!;
    }

    // Create pattern canvas
    const patternCanvas = document.createElement("canvas");
    patternCanvas.width = size * 2;
    patternCanvas.height = size * 2;
    const patternCtx = patternCanvas.getContext("2d");

    if (!patternCtx) return null;

    // Draw checkerboard pattern
    patternCtx.fillStyle = lightColor;
    patternCtx.fillRect(0, 0, size * 2, size * 2);
    patternCtx.fillStyle = darkColor;
    patternCtx.fillRect(0, 0, size, size);
    patternCtx.fillRect(size, size, size, size);

    // Create and cache pattern
    const pattern = ctx.createPattern(patternCanvas, "repeat");
    if (pattern) {
      this.checkerboardPatterns.set(key, pattern);
    }

    return pattern;
  }

  /**
   * Get a temporary canvas for image operations
   * Canvas is reused if same dimensions requested
   */
  getTemporary(width: number, height: number, key: string = "temp"): CachedCanvas {
    const cacheKey = `${key}-${width}-${height}`;
    const now = Date.now();

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      cached.lastUsed = now;
      // Clear the canvas for reuse
      cached.ctx.clearRect(0, 0, width, height);
      return cached;
    }

    // Create new canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx) {
      throw new Error("Failed to get 2d context for temporary canvas");
    }

    const cached: CachedCanvas = {
      canvas,
      ctx,
      lastUsed: now,
      key: cacheKey,
    };

    // Maintain cache size
    this.evictIfNeeded();
    this.cache.set(cacheKey, cached);

    return cached;
  }

  /**
   * Get a compositing canvas (for layer composition operations)
   */
  getCompositing(width: number, height: number): CachedCanvas {
    return this.getTemporary(width, height, "compositing");
  }

  /**
   * Get a stamping canvas (for brush/stamp operations)
   */
  getStamping(width: number, height: number): CachedCanvas {
    return this.getTemporary(width, height, "stamping");
  }

  /**
   * Evict old entries to maintain cache size
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxCacheSize) return;

    const now = Date.now();
    const toDelete: string[] = [];

    // Remove stale entries
    for (const [key, cached] of this.cache) {
      if (now - cached.lastUsed > this.maxAge) {
        toDelete.push(key);
      }
    }

    // If still over limit, remove oldest
    if (this.cache.size - toDelete.length >= this.maxCacheSize) {
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].lastUsed - b[1].lastUsed
      );
      const removeCount = this.cache.size - this.maxCacheSize + 1;
      for (let i = 0; i < removeCount; i++) {
        toDelete.push(entries[i][0]);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Clean up all cached canvases
   * Call when editor is unmounted
   */
  cleanup(): void {
    this.cache.clear();
    this.checkerboardPatterns.clear();
  }

  /**
   * Get cache statistics (for debugging)
   */
  getStats(): { canvases: number; patterns: number } {
    return {
      canvases: this.cache.size,
      patterns: this.checkerboardPatterns.size,
    };
  }
}

// Singleton instance
export const canvasCache = new CanvasCacheImpl();

// Export type for React hook usage
export type CanvasCache = CanvasCacheImpl;
