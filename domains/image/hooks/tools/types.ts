import { CanvasInputEvent } from "../useCanvasInput";

// ============================================
// Tool Interface
// ============================================

/**
 * Base interface for all editor tools.
 * Each tool receives normalized input events and handles them according to its behavior.
 */
export interface EditorTool {
  /** Tool identifier */
  readonly name: string;

  /**
   * Called when input starts (pointer down)
   * @returns true if the tool handled the event and wants to capture subsequent events
   */
  onInputStart(event: CanvasInputEvent): boolean;

  /**
   * Called during input (pointer move while dragging)
   */
  onInputMove(event: CanvasInputEvent): void;

  /**
   * Called when input ends (pointer up or leave)
   */
  onInputEnd(event: CanvasInputEvent): void;

  /**
   * Called on every pointer move (even when not dragging)
   * Useful for cursor updates, hover effects, etc.
   */
  onHover?(event: CanvasInputEvent): void;

  /**
   * Get the cursor style for this tool
   */
  getCursor?(): string;
}

// ============================================
// Tool Context
// ============================================

/**
 * Shared context available to all tools.
 * Contains refs and functions needed by tools to perform their operations.
 */
export interface ToolContext {
  // Canvas refs
  editCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;

  // State getters
  getDisplayDimensions: () => { width: number; height: number };
  getRotation: () => number;
  getCanvasSize: () => { width: number; height: number };
  getZoom: () => number;
  getPan: () => { x: number; y: number };

  // State setters
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;

  // History
  saveToHistory: () => void;

  // Render trigger
  requestRender: () => void;
}

// ============================================
// Tool State Types
// ============================================

export interface BrushToolState {
  brushSize: number;
  brushColor: string;
  brushHardness: number;
  stampSource: { x: number; y: number } | null;
}

export interface SelectionToolState {
  selection: { x: number; y: number; width: number; height: number } | null;
  isMovingSelection: boolean;
  isDuplicating: boolean;
  floatingLayer: {
    imageData: ImageData;
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null;
}

export interface CropToolState {
  cropArea: { x: number; y: number; width: number; height: number } | null;
  aspectRatio: string;
  resizeHandle: string | null;
}
