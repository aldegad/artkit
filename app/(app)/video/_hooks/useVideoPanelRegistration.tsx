"use client";

import { useEffect } from "react";
import {
  VideoPreviewPanelContent,
  VideoTimelinePanelContent,
  clearVideoPanelComponents,
  registerVideoPanelComponent,
} from "@/domains/video";

export function useVideoPanelRegistration(): void {
  useEffect(() => {
    registerVideoPanelComponent("preview", () => <VideoPreviewPanelContent />);
    registerVideoPanelComponent("timeline", () => <VideoTimelinePanelContent />);

    return () => {
      clearVideoPanelComponents();
    };
  }, []);
}
