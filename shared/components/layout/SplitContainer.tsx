"use client";

import { Fragment, useMemo } from "react";
import { LayoutNode, SplitNode, PanelNode, isSplitNode, isPanelNode } from "@/shared/types/layout";
import ResizeHandle from "./ResizeHandle";
import Panel from "./Panel";

// ============================================
// Types
// ============================================

interface SplitContainerProps {
  node: LayoutNode;
}

// ============================================
// Component
// ============================================

export default function SplitContainer({ node }: SplitContainerProps) {
  // Render panel node
  if (isPanelNode(node)) {
    return <Panel node={node as PanelNode} />;
  }

  // Render split node
  if (isSplitNode(node)) {
    const splitNode = node as SplitNode;
    return <SplitNodeRenderer node={splitNode} />;
  }

  // Fallback
  return null;
}

// ============================================
// Split Node Renderer
// ============================================

interface SplitNodeRendererProps {
  node: SplitNode;
}

function SplitNodeRenderer({ node }: SplitNodeRendererProps) {
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
            <SplitContainer node={child} />
          </div>

          {/* Resize handle between children */}
          {index < node.children.length - 1 && (
            <ResizeHandle direction={node.direction} splitId={node.id} handleIndex={index} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
