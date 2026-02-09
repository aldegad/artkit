"use client";

import { useEffect } from "react";
import { CanvasPanelContent, LayersPanelContent } from "../components";
import {
  clearEditorPanelComponents,
  registerEditorPanelComponent,
} from "../components/layout";

export function useEditorPanelRegistration(): void {
  useEffect(() => {
    registerEditorPanelComponent("canvas", () => <CanvasPanelContent />);
    registerEditorPanelComponent("layers", () => <LayersPanelContent />);

    return () => {
      clearEditorPanelComponents();
    };
  }, []);
}
