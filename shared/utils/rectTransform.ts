import type { Point } from "@/shared/types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RectHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type RectHit = RectHandle | "move";

export interface RectHandlePoint extends Point {
  name: RectHandle;
}

export interface GetRectHandleAtPositionOptions {
  handleSize?: number;
  includeMove?: boolean;
}

export interface ResizeRectByHandleOptions {
  minWidth?: number;
  minHeight?: number;
  keepAspect?: boolean;
  targetAspect?: number;
  fromCenter?: boolean;
}

export interface CreateRectFromDragOptions {
  keepAspect?: boolean;
  targetAspect?: number;
  round?: boolean;
  bounds?: RectBounds;
  fromCenter?: boolean;
}

export interface RectBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const MIN_DIMENSION_EPSILON = 0.0001;

function clampMin(value: number, min: number): number {
  return Math.max(min, value);
}

function getAspect(width: number, height: number): number {
  return width / Math.max(height, MIN_DIMENSION_EPSILON);
}

export function getRectHandles(rect: Rect): RectHandlePoint[] {
  const { x, y, width, height } = rect;
  return [
    { x, y, name: "nw" },
    { x: x + width / 2, y, name: "n" },
    { x: x + width, y, name: "ne" },
    { x: x + width, y: y + height / 2, name: "e" },
    { x: x + width, y: y + height, name: "se" },
    { x: x + width / 2, y: y + height, name: "s" },
    { x, y: y + height, name: "sw" },
    { x, y: y + height / 2, name: "w" },
  ];
}

export function isPointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function getRectHandleAtPosition(
  point: Point,
  rect: Rect,
  options: GetRectHandleAtPositionOptions = {}
): RectHit | null {
  const { handleSize = 10, includeMove = false } = options;
  const handles = getRectHandles(rect);

  for (const handle of handles) {
    if (Math.abs(point.x - handle.x) <= handleSize && Math.abs(point.y - handle.y) <= handleSize) {
      return handle.name;
    }
  }

  if (includeMove && isPointInRect(point, rect)) {
    return "move";
  }

  return null;
}

export function resizeRectByHandle(
  original: Rect,
  handle: RectHandle,
  delta: { dx: number; dy: number },
  options: ResizeRectByHandleOptions = {}
): Rect {
  const minWidth = options.minWidth ?? 1;
  const minHeight = options.minHeight ?? 1;
  const fromCenter = options.fromCenter ?? false;
  const keepAspect = options.keepAspect ?? false;
  const originalAspect = getAspect(original.width, original.height);
  const targetAspect =
    keepAspect && options.targetAspect && options.targetAspect > 0 ? options.targetAspect : originalAspect;

  const { dx, dy } = delta;
  const orig = original;
  const next = { ...orig };

  switch (handle) {
    case "se":
      next.width = clampMin(orig.width + dx, minWidth);
      next.height = clampMin(orig.height + dy, minHeight);
      if (keepAspect) {
        const scaleX = next.width / Math.max(orig.width, MIN_DIMENSION_EPSILON);
        const scaleY = next.height / Math.max(orig.height, MIN_DIMENSION_EPSILON);
        if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
          next.height = next.width / targetAspect;
        } else {
          next.width = next.height * targetAspect;
        }
      }
      if (fromCenter) {
        const widthChange = next.width - orig.width;
        const heightChange = next.height - orig.height;
        next.x = orig.x - widthChange / 2;
        next.y = orig.y - heightChange / 2;
        next.width = orig.width + widthChange;
        next.height = orig.height + heightChange;
      }
      break;

    case "nw":
      next.x = orig.x + dx;
      next.y = orig.y + dy;
      next.width = clampMin(orig.width - dx, minWidth);
      next.height = clampMin(orig.height - dy, minHeight);
      if (keepAspect) {
        const scaleX = next.width / Math.max(orig.width, MIN_DIMENSION_EPSILON);
        const scaleY = next.height / Math.max(orig.height, MIN_DIMENSION_EPSILON);
        if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
          next.height = next.width / targetAspect;
          next.y = orig.y + orig.height - next.height;
        } else {
          next.width = next.height * targetAspect;
          next.x = orig.x + orig.width - next.width;
        }
      }
      if (fromCenter) {
        const widthChange = next.width - orig.width;
        const heightChange = next.height - orig.height;
        next.x = orig.x - widthChange / 2;
        next.y = orig.y - heightChange / 2;
        next.width = orig.width + widthChange;
        next.height = orig.height + heightChange;
      }
      break;

    case "ne":
      next.y = orig.y + dy;
      next.width = clampMin(orig.width + dx, minWidth);
      next.height = clampMin(orig.height - dy, minHeight);
      if (keepAspect) {
        const scaleX = next.width / Math.max(orig.width, MIN_DIMENSION_EPSILON);
        const scaleY = next.height / Math.max(orig.height, MIN_DIMENSION_EPSILON);
        if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
          next.height = next.width / targetAspect;
          next.y = orig.y + orig.height - next.height;
        } else {
          next.width = next.height * targetAspect;
        }
      }
      if (fromCenter) {
        const widthChange = next.width - orig.width;
        const heightChange = next.height - orig.height;
        next.x = orig.x - widthChange / 2;
        next.y = orig.y - heightChange / 2;
        next.width = orig.width + widthChange;
        next.height = orig.height + heightChange;
      }
      break;

    case "sw":
      next.x = orig.x + dx;
      next.width = clampMin(orig.width - dx, minWidth);
      next.height = clampMin(orig.height + dy, minHeight);
      if (keepAspect) {
        const scaleX = next.width / Math.max(orig.width, MIN_DIMENSION_EPSILON);
        const scaleY = next.height / Math.max(orig.height, MIN_DIMENSION_EPSILON);
        if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
          next.height = next.width / targetAspect;
        } else {
          next.width = next.height * targetAspect;
          next.x = orig.x + orig.width - next.width;
        }
      }
      if (fromCenter) {
        const widthChange = next.width - orig.width;
        const heightChange = next.height - orig.height;
        next.x = orig.x - widthChange / 2;
        next.y = orig.y - heightChange / 2;
        next.width = orig.width + widthChange;
        next.height = orig.height + heightChange;
      }
      break;

    case "n":
      next.y = orig.y + dy;
      next.height = clampMin(orig.height - dy, minHeight);
      if (keepAspect) {
        next.width = next.height * targetAspect;
        next.x = orig.x + (orig.width - next.width) / 2;
      }
      if (fromCenter) {
        const heightChange = next.height - orig.height;
        next.y = orig.y - heightChange / 2;
        next.height = orig.height + heightChange;
      }
      break;

    case "s":
      next.height = clampMin(orig.height + dy, minHeight);
      if (keepAspect) {
        next.width = next.height * targetAspect;
        next.x = orig.x + (orig.width - next.width) / 2;
      }
      if (fromCenter) {
        const heightChange = next.height - orig.height;
        next.y = orig.y - heightChange / 2;
        next.height = orig.height + heightChange;
      }
      break;

    case "e":
      next.width = clampMin(orig.width + dx, minWidth);
      if (keepAspect) {
        next.height = next.width / targetAspect;
        next.y = orig.y + (orig.height - next.height) / 2;
      }
      if (fromCenter) {
        const widthChange = next.width - orig.width;
        next.x = orig.x - widthChange / 2;
        next.width = orig.width + widthChange;
      }
      break;

    case "w":
      next.x = orig.x + dx;
      next.width = clampMin(orig.width - dx, minWidth);
      if (keepAspect) {
        next.height = next.width / targetAspect;
        next.y = orig.y + (orig.height - next.height) / 2;
      }
      if (fromCenter) {
        const widthChange = next.width - orig.width;
        next.x = orig.x - widthChange / 2;
        next.width = orig.width + widthChange;
      }
      break;
  }

  return next;
}

export function createRectFromDrag(
  start: Point,
  current: Point,
  options: CreateRectFromDragOptions = {}
): Rect {
  const keepAspect = options.keepAspect ?? false;
  const round = options.round ?? false;
  const bounds = options.bounds;
  const fromCenter = options.fromCenter ?? false;
  const targetAspect =
    keepAspect && options.targetAspect && options.targetAspect > 0 ? options.targetAspect : 1;

  const dx = current.x - start.x;
  const dy = current.y - start.y;
  let x: number;
  let y: number;
  let width: number;
  let height: number;

  if (fromCenter) {
    let halfWidth = Math.abs(dx);
    let halfHeight = Math.abs(dy);

    if (keepAspect) {
      const widthFromHeight = halfHeight * targetAspect;
      if (halfWidth >= widthFromHeight) {
        halfHeight = halfWidth / targetAspect;
      } else {
        halfWidth = widthFromHeight;
      }
    }

    if (bounds) {
      const maxHalfWidth = Math.max(0, Math.min(start.x - bounds.minX, bounds.maxX - start.x));
      const maxHalfHeight = Math.max(0, Math.min(start.y - bounds.minY, bounds.maxY - start.y));

      if (keepAspect) {
        if (halfWidth > maxHalfWidth) {
          halfWidth = maxHalfWidth;
          halfHeight = halfWidth / targetAspect;
        }
        if (halfHeight > maxHalfHeight) {
          halfHeight = maxHalfHeight;
          halfWidth = halfHeight * targetAspect;
        }
      } else {
        halfWidth = Math.min(halfWidth, maxHalfWidth);
        halfHeight = Math.min(halfHeight, maxHalfHeight);
      }
    }

    width = halfWidth * 2;
    height = halfHeight * 2;
    x = start.x - halfWidth;
    y = start.y - halfHeight;
  } else {
    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;

    width = Math.abs(dx);
    height = Math.abs(dy);

    if (keepAspect) {
      const widthFromHeight = height * targetAspect;
      if (width >= widthFromHeight) {
        height = width / targetAspect;
      } else {
        width = widthFromHeight;
      }
    }

    if (bounds) {
      const maxWidth = Math.max(0, signX > 0 ? bounds.maxX - start.x : start.x - bounds.minX);
      const maxHeight = Math.max(0, signY > 0 ? bounds.maxY - start.y : start.y - bounds.minY);

      if (keepAspect) {
        if (width > maxWidth) {
          width = maxWidth;
          height = width / targetAspect;
        }
        if (height > maxHeight) {
          height = maxHeight;
          width = height * targetAspect;
        }
      } else {
        width = Math.min(width, maxWidth);
        height = Math.min(height, maxHeight);
      }
    }

    x = signX > 0 ? start.x : start.x - width;
    y = signY > 0 ? start.y : start.y - height;
  }

  if (round) {
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  return { x, y, width, height };
}

export function clampRectToBounds(rect: Rect, bounds: RectBounds): Rect {
  const x = Math.max(bounds.minX, rect.x);
  const y = Math.max(bounds.minY, rect.y);
  const width = Math.max(0, Math.min(rect.width, bounds.maxX - x));
  const height = Math.max(0, Math.min(rect.height, bounds.maxY - y));
  return { x, y, width, height };
}
