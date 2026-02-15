interface VideoEditorTranslationSource {
  file?: string;
  edit?: string;
  view?: string;
  window?: string;
  settings?: string;
  new?: string;
  load?: string;
  save?: string;
  saveAs?: string;
  importMedia?: string;
  exportVideo?: string;
  undo?: string;
  redo?: string;
  cut?: string;
  copy?: string;
  paste?: string;
  delete?: string;
  zoomIn?: string;
  zoomOut?: string;
  fitToScreen?: string;
  panelHeaders?: string;
  timeline?: string;
  previewVideoCache?: string;
  previewQualityFirst?: string;
  resetLayout?: string;
  select?: string;
  selectDesc?: string;
  hand?: string;
  handToolTip?: string;
  zoomInOut?: string;
  zoomToolTip?: string;
  trim?: string;
  trimDesc?: string;
  razor?: string;
  razorDesc?: string;
  crop?: string;
  cropToolTip?: string;
  mask?: string;
  maskDesc?: string;
  frameInterpolation?: string;
  frameInterpolationDescription?: string;
}

export function createVideoMenuTranslations(t: VideoEditorTranslationSource) {
  return {
    file: t.file ?? "",
    edit: t.edit ?? "",
    view: t.view ?? "",
    window: t.window ?? "",
    settings: t.settings ?? "",
    new: t.new ?? "",
    load: t.load ?? "",
    save: t.save ?? "",
    saveAs: t.saveAs ?? "",
    importMedia: t.importMedia ?? "",
    exportVideo: t.exportVideo ?? "",
    undo: t.undo ?? "",
    redo: t.redo ?? "",
    cut: t.cut ?? "",
    copy: t.copy ?? "",
    paste: t.paste ?? "",
    delete: t.delete ?? "",
    zoomIn: t.zoomIn ?? "",
    zoomOut: t.zoomOut ?? "",
    fitToScreen: t.fitToScreen ?? "",
    panelHeaders: t.panelHeaders ?? "",
    timeline: t.timeline ?? "",
    previewVideoCache: t.previewVideoCache ?? "",
    previewQualityFirst: t.previewQualityFirst ?? "",
    resetLayout: t.resetLayout ?? "",
  };
}

export function createVideoToolbarTranslations(t: VideoEditorTranslationSource) {
  return {
    select: t.select ?? "",
    selectDesc: t.selectDesc ?? "",
    transform: "Transform",
    transformDesc: "Scale and move clip content",
    hand: t.hand ?? "",
    handDesc: t.handToolTip ?? "",
    zoomInOut: t.zoomInOut ?? "",
    zoomToolTip: t.zoomToolTip ?? "",
    trim: t.trim ?? "",
    trimDesc: t.trimDesc ?? "",
    razor: t.razor ?? "",
    razorDesc: t.razorDesc ?? "",
    crop: t.crop ?? "",
    cropDesc: t.cropToolTip || "Crop and expand canvas",
    mask: t.mask ?? "",
    maskDesc: t.maskDesc ?? "",
    frameInterpolation: t.frameInterpolation ?? "",
    frameInterpolationDescription: t.frameInterpolationDescription ?? "",
    delete: t.delete ?? "",
    fitToScreen: t.fitToScreen ?? "",
  };
}
