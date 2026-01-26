"use client";

import { Fragment, useMemo } from "react";
import { LayoutNode, SplitNode, PanelNode, isSplitNode, isPanelNode } from "../../../../types/layout";
import EditorResizeHandle from "./EditorResizeHandle";
import EditorPanel from "./EditorPanel";

// ============================================
// Types
// ============================================

interface EditorSplitContainerProps {
  node: LayoutNode;
}

// ============================================
// Component
// ============================================

export default function EditorSplitContainer({ node }: EditorSplitContainerProps) {
  // Render panel node
  if (isPanelNode(node)) {
    return <EditorPanel node={node as PanelNode} />;
  }

  // Render split node
  if (isSplitNode(node)) {
    const splitNode = node as SplitNode;
    return <EditorSplitNodeRenderer node={splitNode} />;
  }

  // Fallback
  return null;
}

// ============================================
// Split Node Renderer
// ============================================

interface EditorSplitNodeRendererProps {
  node: SplitNode;
}

function EditorSplitNodeRenderer({ node }: EditorSplitNodeRendererProps) {
  const isHorizontal = node.direction === "horizontal";

  // Calculate flex basis for each child
  const childStyles = useMemo(() => {
    return node.sizes.map((size) => ({
      flex: `${size} 0 0%`,
      minWidth: isHorizontal ? 0 : undefined,
      minHeight: isHorizontal ? undefined : 0,
    }));
  }, [node.sizes, isHorizontal]);

  return (
    <div
      className={`
        flex h-full w-full overflow-hidden
        ${isHorizontal ? "flex-row" : "flex-col"}
      `}
    >
      {node.children.map((child, index) => (
        <Fragment key={child.id}>
          {/* Child container */}
          <div style={childStyles[index]} className="overflow-hidden">
            <EditorSplitContainer node={child} />
          </div>

          {/* Resize handle between children */}
          {index < node.children.length - 1 && (
            <EditorResizeHandle direction={node.direction} splitId={node.id} handleIndex={index} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
