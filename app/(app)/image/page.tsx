"use client";

import { SaveToast, LoadingOverlay } from "@/shared/components";
import {
  useImageEditorController,
  EditorHeader,
  EditorOverlays,
  EditorActionToolbar,
  EditorToolOptionsBar,
  EditorLayersProvider,
  EditorCanvasProvider,
} from "@/domains/image";
import {
  EditorLayoutProvider,
  useEditorLayout,
  EditorStateProvider,
  EditorRefsProvider,
} from "@/domains/image/contexts";
import {
  EditorSplitContainer,
  EditorFloatingWindows,
} from "@/domains/image/components/layout";

function EditorDockableArea() {
  const { layoutState } = useEditorLayout();
  return (
    <>
      <EditorSplitContainer node={layoutState.root} />
      <EditorFloatingWindows />
    </>
  );
}

export default function ImageEditor() {
  return (
    <EditorLayoutProvider>
      <EditorStateProvider>
        <EditorRefsProvider>
          <ImageEditorContent />
        </EditorRefsProvider>
      </EditorStateProvider>
    </EditorLayoutProvider>
  );
}

function ImageEditorContent() {
  const controller = useImageEditorController();

  return (
    <EditorLayersProvider value={controller.layerContextValue}>
      <EditorCanvasProvider value={controller.canvasContextValue}>
        <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden relative">
          <LoadingOverlay
            isLoading={controller.loadingOverlay.isLoading}
            message={controller.loadingOverlay.message}
          />

          <SaveToast
            isSaving={controller.saveToast.isSaving}
            saveCount={controller.saveToast.saveCount}
            savingLabel={controller.saveToast.savingLabel}
            savedLabel={controller.saveToast.savedLabel}
          />

          <EditorHeader {...controller.headerProps} />

          {controller.showToolbars && <EditorActionToolbar {...controller.actionToolbarProps} />}

          {controller.showToolbars && <EditorToolOptionsBar {...controller.toolOptionsBarProps} />}

          <div className="flex-1 h-full w-full min-h-0 flex overflow-hidden relative">
            <EditorDockableArea />
          </div>

          <EditorOverlays {...controller.overlaysProps} />
        </div>
      </EditorCanvasProvider>
    </EditorLayersProvider>
  );
}
