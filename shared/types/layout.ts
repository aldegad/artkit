// ============================================
// Split View Layout Types
// ============================================

export type SplitDirection = "horizontal" | "vertical";

// Base node type
export interface LayoutNode {
  type: "split" | "panel";
  id: string;
}

// Split node: contains children with specified direction
export interface SplitNode extends LayoutNode {
  type: "split";
  direction: SplitDirection;
  children: LayoutNode[];
  sizes: number[]; // flex ratios (should sum to 100)
}

// Panel node: leaf node containing actual content
export interface PanelNode extends LayoutNode {
  type: "panel";
  panelId: string; // "canvas", "timeline", "preview", "frame-preview", etc.
  minSize?: number; // minimum size in pixels
}

// Snap edge type (includes corners)
export type SnapEdge =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

// Snap info for minimized floating window
export interface SnapInfo {
  panelId: string;
  edge: SnapEdge;
}

// Floating window (not docked)
export interface FloatingWindow {
  id: string;
  panelId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isMinimized: boolean;
  // Snap info for minimized windows
  snappedTo?: SnapInfo;
  // Position before expanding (to restore when minimizing again)
  minimizedPosition?: { x: number; y: number };
}

export interface DockedPanelCollapseState {
  splitId: string;
  previousSizes: number[];
}

// Complete layout state
export interface LayoutState {
  root: SplitNode;
  floatingWindows: FloatingWindow[];
  dockedPanelCollapseStates: Record<string, DockedPanelCollapseState>;
  activePanelId: string | null;
  isDragging: boolean;
  draggedWindowId: string | null;
  dropTarget: DropTarget | null;
}

// Drop target for docking
export interface DropTarget {
  panelId: string;
  position: "left" | "right" | "top" | "bottom" | "center";
}

// Resize state
export interface ResizeState {
  splitId: string;
  handleIndex: number;
  startPosition: number;
  direction: SplitDirection;
  originalSizes?: number[]; // Stored at drag start for absolute delta calculation
  originalContainerSize?: number; // Container size at drag start
  actualContainerSize?: number; // Actual split container size (from handle's parent element)
}

// ============================================
// Default Layouts
// ============================================

export const DEFAULT_LAYOUT: SplitNode = {
  type: "split",
  id: "root",
  direction: "vertical",
  children: [
    { type: "panel", id: "canvas-panel", panelId: "canvas", minSize: 150 } as PanelNode,
    { type: "panel", id: "timeline-panel", panelId: "timeline", minSize: 100 } as PanelNode,
  ],
  sizes: [60, 40],
};

// ============================================
// Type Guards
// ============================================

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === "split";
}

export function isPanelNode(node: LayoutNode): node is PanelNode {
  return node.type === "panel";
}

// ============================================
// Tree Utilities
// ============================================

// Find a node by ID in the tree
export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;

  if (isSplitNode(root)) {
    for (const child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }

  return null;
}

// Find parent of a node
export function findParent(
  root: SplitNode,
  nodeId: string,
): { parent: SplitNode; index: number } | null {
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    if (child.id === nodeId) {
      return { parent: root, index: i };
    }
    if (isSplitNode(child)) {
      const found = findParent(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

// Deep clone a layout node
export function cloneNode(node: LayoutNode): LayoutNode {
  if (isPanelNode(node)) {
    return { ...node } as PanelNode;
  }

  const splitNode = node as SplitNode;
  const cloned: SplitNode = {
    type: "split",
    id: splitNode.id,
    direction: splitNode.direction,
    children: splitNode.children.map((child) => cloneNode(child)),
    sizes: [...splitNode.sizes],
  };
  return cloned;
}

// Generate unique ID
export function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Update sizes of a split node
export function updateNodeSizes(root: SplitNode, splitId: string, newSizes: number[]): SplitNode {
  if (root.id === splitId) {
    return { ...root, sizes: newSizes };
  }

  return {
    ...root,
    children: root.children.map((child) => {
      if (isSplitNode(child)) {
        return updateNodeSizes(child, splitId, newSizes);
      }
      return child;
    }),
  };
}

// Add a panel to the layout
export function addPanelToLayout(
  root: SplitNode,
  targetPanelId: string,
  newPanelId: string,
  newPanelContentId: string,
  position: "left" | "right" | "top" | "bottom",
): SplitNode {
  const targetInfo = findParent(root, targetPanelId);
  if (!targetInfo) return root;

  const { parent, index } = targetInfo;
  const targetPanel = parent.children[index] as PanelNode;

  const isHorizontalSplit = position === "left" || position === "right";
  const newDirection: SplitDirection = isHorizontalSplit ? "horizontal" : "vertical";

  // Create new panel node
  const newPanel: PanelNode = {
    type: "panel",
    id: newPanelId,
    panelId: newPanelContentId,
    minSize: 150,
  };

  // If parent direction matches, just insert
  if (parent.direction === newDirection) {
    const insertIndex = position === "left" || position === "top" ? index : index + 1;
    const newChildren = [...parent.children];
    const newSizes = [...parent.sizes];

    newChildren.splice(insertIndex, 0, newPanel);

    // Adjust sizes: take some space from the target panel
    const targetSize = parent.sizes[index];
    const splitSize = targetSize / 2;
    newSizes[index] = splitSize;
    newSizes.splice(insertIndex, 0, splitSize);

    // Update root if parent is root
    if (parent.id === root.id) {
      return { ...root, children: newChildren, sizes: newSizes };
    }

    // Otherwise, update the parent in the tree
    return updateSplitInTree(root, parent.id, { children: newChildren, sizes: newSizes });
  }

  // Otherwise, wrap the target in a new split
  const newSplit: SplitNode = {
    type: "split",
    id: generateId(),
    direction: newDirection,
    children:
      position === "left" || position === "top" ? [newPanel, targetPanel] : [targetPanel, newPanel],
    sizes: [50, 50],
  };

  // Replace target panel with new split
  const newChildren = [...parent.children];
  newChildren[index] = newSplit;

  if (parent.id === root.id) {
    return { ...root, children: newChildren };
  }

  return updateSplitInTree(root, parent.id, { children: newChildren });
}

// Helper to update a split node in the tree
function updateSplitInTree(
  root: SplitNode,
  splitId: string,
  updates: Partial<SplitNode>,
): SplitNode {
  if (root.id === splitId) {
    return { ...root, ...updates };
  }

  return {
    ...root,
    children: root.children.map((child) => {
      if (isSplitNode(child)) {
        return updateSplitInTree(child, splitId, updates);
      }
      return child;
    }),
  };
}

// Remove a panel from the layout
export function removePanelFromLayout(root: SplitNode, panelId: string): SplitNode {
  const parentInfo = findParent(root, panelId);
  if (!parentInfo) return root;

  const { parent, index } = parentInfo;

  // Remove the panel
  const newChildren = parent.children.filter((_, i) => i !== index);
  const newSizes = parent.sizes.filter((_, i) => i !== index);

  // Normalize sizes to sum to 100
  const total = newSizes.reduce((a, b) => a + b, 0);
  const normalizedSizes = newSizes.map((s) => (s / total) * 100);

  // If only one child remains, replace parent with that child
  if (newChildren.length === 1) {
    const remainingChild = newChildren[0];

    // Find grandparent and replace parent with remaining child
    const grandparentInfo = findParent(root, parent.id);
    if (!grandparentInfo) {
      // Parent is root, return the remaining child if it's a split
      if (isSplitNode(remainingChild)) {
        return remainingChild;
      }
      // Otherwise wrap in a split
      return {
        ...root,
        children: [remainingChild],
        sizes: [100],
      };
    }

    const { parent: grandparent, index: parentIndex } = grandparentInfo;
    const grandparentChildren = [...grandparent.children];
    grandparentChildren[parentIndex] = remainingChild;

    return updateSplitInTree(root, grandparent.id, { children: grandparentChildren });
  }

  // Otherwise, just update the children
  if (parent.id === root.id) {
    return { ...root, children: newChildren, sizes: normalizedSizes };
  }

  return updateSplitInTree(root, parent.id, { children: newChildren, sizes: normalizedSizes });
}
