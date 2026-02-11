"use client";

import { useMemo } from "react";

interface EditorTranslationSource {
  file: string;
  edit: string;
  view: string;
  window: string;
  new: string;
  load: string;
  save: string;
  saveAs: string;
  importImage: string;
  export: string;
  exportLayers: string;
  undo: string;
  redo: string;
  layers: string;
  showRulers: string;
  showGuides: string;
  lockGuides: string;
  snapToGuides: string;
  clearGuides: string;
  panelHeaders: string;
  removeBackground: string;
  rotate: string;
  rotateLeft: string;
  rotateRight: string;
  fitToScreen: string;
  size: string;
  hardness: string;
  presets: string;
  pressure: string;
  builtIn: string;
  color: string;
  source: string;
  altClickToSetSource: string;
  cancel: string;
  projectName: string;
  format: string;
  quality: string;
  background: string;
  transparent: string;
  confirm: string;
  delete: string;
  loading: string;
  savedProjects?: string;
  noSavedProjects?: string;
}

interface EditorTranslationBundles {
  menu: {
    file: string;
    edit: string;
    view: string;
    window: string;
    new: string;
    load: string;
    save: string;
    saveAs: string;
    importImage: string;
    export: string;
    exportLayers: string;
    undo: string;
    redo: string;
    layers: string;
    showRulers: string;
    showGuides: string;
    lockGuides: string;
    snapToGuides: string;
    clearGuides: string;
    panelHeaders: string;
  };
  actionToolbar: {
    removeBackground: string;
    undo: string;
    redo: string;
    rotate: string;
    rotateLeft: string;
    rotateRight: string;
    fitToScreen: string;
  };
  toolOptions: {
    size: string;
    hardness: string;
    color: string;
    source: string;
    altClickToSetSource: string;
    presets: string;
    pressure: string;
    builtIn: string;
  };
  exportModal: {
    export: string;
    cancel: string;
    fileName: string;
    format: string;
    quality: string;
    backgroundColor: string;
    transparent: string;
  };
  backgroundRemoval: {
    removeBackground: string;
    cancel: string;
    confirm: string;
  };
  transformDiscard: {
    title: string;
    message: string;
    discard: string;
    apply: string;
    cancel: string;
  };
  projectList: {
    savedProjects: string;
    noSavedProjects: string;
    delete: string;
    loading: string;
  };
}

export function useEditorTranslationBundles(
  source: EditorTranslationSource
): EditorTranslationBundles {
  return useMemo(
    () => ({
      menu: {
        file: source.file,
        edit: source.edit,
        view: source.view,
        window: source.window,
        new: source.new,
        load: source.load,
        save: source.save,
        saveAs: source.saveAs,
        importImage: source.importImage,
        export: source.export,
        exportLayers: source.exportLayers,
        undo: source.undo,
        redo: source.redo,
        layers: source.layers,
        showRulers: source.showRulers,
        showGuides: source.showGuides,
        lockGuides: source.lockGuides,
        snapToGuides: source.snapToGuides,
        clearGuides: source.clearGuides,
        panelHeaders: source.panelHeaders,
      },
      actionToolbar: {
        removeBackground: source.removeBackground,
        undo: source.undo,
        redo: source.redo,
        rotate: source.rotate,
        rotateLeft: source.rotateLeft,
        rotateRight: source.rotateRight,
        fitToScreen: source.fitToScreen,
      },
      toolOptions: {
        size: source.size,
        hardness: source.hardness,
        color: source.color,
        source: source.source,
        altClickToSetSource: source.altClickToSetSource,
        presets: source.presets,
        pressure: source.pressure,
        builtIn: source.builtIn,
      },
      exportModal: {
        export: source.export,
        cancel: source.cancel,
        fileName: source.projectName,
        format: source.format,
        quality: source.quality,
        backgroundColor: source.background,
        transparent: source.transparent,
      },
      backgroundRemoval: {
        removeBackground: source.removeBackground,
        cancel: source.cancel,
        confirm: source.confirm,
      },
      transformDiscard: {
        title: "변환 취소",
        message: "적용하지 않은 변환이 있습니다. 변환을 취소하면 원래 상태로 되돌아갑니다.",
        discard: "취소하고 전환",
        apply: "적용하고 전환",
        cancel: "돌아가기",
      },
      projectList: {
        savedProjects: source.savedProjects || "저장된 프로젝트",
        noSavedProjects: source.noSavedProjects || "저장된 프로젝트가 없습니다",
        delete: source.delete,
        loading: source.loading,
      },
    }),
    [source]
  );
}
