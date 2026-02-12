"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "ko" | "en";

interface Translations {
  // Header
  spriteEditor: string;
  imageEditor: string;
  imageConverter: string;
  soundEditor: string;
  videoEditor: string;
  iconShowcase: string;

  // Settings menu
  settings: string;
  theme: string;
  language: string;
  light: string;
  dark: string;
  system: string;
  korean: string;
  english: string;

  // Common actions
  new: string;
  open: string;
  save: string;
  saveAs: string;
  load: string;
  delete: string;
  cancel: string;
  confirm: string;
  close: string;
  reset: string;

  // Menu
  file: string;
  view: string;
  window: string;
  importImage: string;
  loading: string;

  // View menu
  showRulers: string;
  showGuides: string;
  lockGuides: string;
  snapToGuides: string;
  clearGuides: string;
  panelHeaders: string;

  // Sprite editor
  importSheet: string;
  pen: string;
  select: string;
  hand: string;
  undo: string;
  redo: string;
  rotate: string;
  complete: string;
  points: string;
  frame: string;
  frames: string;
  selected: string;
  point: string;
  newProject: string;
  projectName: string;
  otherName: string;
  savedProjects: string;
  noSavedProjects: string;
  storage: string;
  export: string;
  resampleAllResolution: string;
  resampleUseCurrentSize: string;
  resampleQualitySmooth: string;
  resampleQualityBalanced: string;
  resampleQualityPixel: string;
  resampleQualityHint: string;
  resampling: string;
  exportLayers: string;
  import: string;
  importComplete: string;
  added: string;
  skipped: string;
  deleteConfirm: string;
  newProjectConfirm: string;
  noFramesToSave: string;
  saving: string;
  saved: string;
  saveFailed: string;
  deleteFailed: string;
  importFailed: string;
  exportFailed: string;
  exportType: string;
  exportTypeZip: string;
  exportTypeSpriteSheetPng: string;
  exportTypeSpriteSheetWebp: string;
  exportTypeMp4: string;
  exportColumns: string;
  exportColumnsAuto: string;
  exportCanvasSize: string;
  exportUseSourceSize: string;
  exportWidth: string;
  exportHeight: string;
  exportKeepAspectRatio: string;
  exportCanvasSizeLimit: string;
  exportPadding: string;
  exportBgTransparent: string;
  exportLoopCount: string;
  exporting: string;
  exportFileName: string;
  exportTypeOptimizedZip: string;
  exportOptimizedTarget: string;
  exportOptimizedThreshold: string;
  exportOptimizedThresholdHint: string;
  exportOptimizedIncludeGuide: string;
  exportOptimizedImageFormat: string;
  exportOptimizedFormatPng: string;
  exportOptimizedFormatWebp: string;
  exportOptimizedTileSize: string;
  enterProjectName: string;
  importOverwriteConfirm: string;
  noFrames: string;

  // Converter
  format: string;
  quality: string;
  converting: string;
  convertAll: string;
  downloadAll: string;
  clear: string;
  files: string;
  addMore: string;
  download: string;
  flipHorizontal: string;
  resize: string;
  maxSidePx: string;

  // Editor
  crop: string;
  zoom: string;
  brush: string;
  eraser: string;
  magicWand: string;
  eyedropper: string;
  stamp: string;
  marquee: string;
  move: string;
  fill: string;
  layers: string;
  layer: string;
  newCanvas: string;
  clearEditConfirm: string;
  minOneLayerRequired: string;
  unsavedChangesConfirm: string;
  cloneStamp: string;
  zoomInOut: string;
  rotateLeft: string;
  rotateRight: string;
  zoomIn: string;
  zoomOut: string;
  fitToScreen: string;
  panLockOn: string;
  panLockOff: string;
  addLayer: string;
  hideLayer: string;
  showLayer: string;
  moveUp: string;
  moveDown: string;
  deleteLayer: string;
  mergeDown: string;
  openLayerPanel: string;
  size: string;
  hardness: string;
  feather: string;
  presets: string;
  pressure: string;
  builtIn: string;
  color: string;
  source: string;
  altClickToSetSource: string;
  resetEdit: string;
  opacity: string;
  closePanel: string;

  // Composition Layers Panel
  lockLayer: string;
  unlockLayer: string;
  duplicateLayer: string;
  noLayersYet: string;
  clickAddLayerToStart: string;
  layerCount: string;

  // ImageDropZone
  dragOrClickToOpen: string;
  selectImageForSprite: string;
  startImageEditing: string;
  dragOrClickToSelect: string;
  selectImagesToConvert: string;

  // Tooltips
  clickToAddPoint: string;
  firstPointToComplete: string;
  clickToSelect: string;
  dragToMove: string;
  dragToPan: string;
  spaceAltToPan: string;
  wheelToZoom: string;
  penToolTip: string;
  selectToolTip: string;
  handToolTip: string;
  brushToolTip: string;
  eraserToolTip: string;
  fillToolTip: string;
  eyedropperToolTip: string;
  cloneStampToolTip: string;
  cropToolTip: string;
  zoomToolTip: string;
  magicWandToolTip: string;
  moveToolTip: string;

  // Timeline
  reorderMode: string;
  offsetMode: string;
  deleteFrame: string;
  resetToOriginal: string;
  backgroundRemovalMode: string;
  removeBackground: string;
  removingBackground: string;
  backgroundRemovalFailed: string;
  connectedAreaOnly: string;
  allSameColor: string;

  // Animation Preview
  noFramesAvailable: string;
  pause: string;
  play: string;
  scale: string;
  background: string;
  transparent: string;
  customColor: string;
  uploadBgImage: string;
  image: string;
  removeBgImage: string;
  colorBlack: string;
  colorWhite: string;
  colorGray: string;
  colorSky: string;
  colorGreen: string;
  colorPink: string;

  // Frame Preview
  brushDraw: string;
  colorPickerTip: string;
  tolerance: string;
  selectFrame: string;
  previous: string;
  next: string;
  removeBackgroundTip: string;

  // Timeline Controls
  reorder: string;
  offset: string;
  animation: string;
  frameWindow: string;

  // Video Import
  importVideo: string;
  videoImport: string;
  extractFrames: string;
  everyNthFrame: string;
  timeInterval: string;
  seconds: string;
  extracting: string;
  maxFrames: string;
  importSelected: string;
  selectVideo: string;
  videoPreview: string;
  extractionSettings: string;
  extractedFrames: string;
  noFramesExtracted: string;
  selectAll: string;
  deselectAll: string;
  framesSelected: string;

  // Frame Background Removal
  removingBackgroundDesc: string;
  frameBackgroundRemoval: string;
  firstRunDownload: string;
  selectFrameForBgRemoval: string;
  frameImageNotFound: string;
  removeBackgroundCurrentFrame: string;
  removeBackgroundSelectedFrames: string;
  removeBackgroundAllFrames: string;
  processingFrameProgress: string;

  // Frame Interpolation
  frameInterpolation: string;
  frameInterpolationDescription: string;
  aiSelection: string;
  aiSelectionDescription: string;
  interpolationFirstRunDownload: string;
  interpolationSteps: string;
  interpolationQuality: string;
  interpolationQualityFast: string;
  interpolationQualityHigh: string;
  interpolationQualityFastHint: string;
  interpolationQualityHighHint: string;
  interpolationEstimatedFrames: string;
  selectFramesForInterpolation: string;
  interpolationFailed: string;
  interpolationProgress: string;

  // Layout components
  floatingMode: string;
  undock: string;
  dockLeft: string;
  dockRight: string;
  dockTop: string;
  dockBottom: string;

  // Video Editor
  edit: string;
  openProject: string;
  importMedia: string;
  exportVideo: string;
  cut: string;
  copy: string;
  paste: string;
  timeline: string;
  trim: string;
  trimDesc: string;
  razor: string;
  razorDesc: string;
  mask: string;
  maskDesc: string;
  paintMask: string;
  eraseMask: string;
  rectangleMask: string;
  fillMask: string;
  clearMask: string;
  longPressToEdit: string;
  selectDesc: string;
  duplicate: string;
  duplicateDesc: string;
  stop: string;
  previousFrame: string;
  nextFrame: string;
  includeAudio: string;
  compression: string;
  backgroundColor: string;
  compressionHighQuality: string;
  compressionBalanced: string;
  compressionSmallFile: string;
  dropMediaHere: string;
  dropMediaDesc: string;
  dropOrClickToImport: string;
  supportedFormats: string;
  resetLayout: string;
  previewVideoCache: string;

  // Landing page
  landingTagline: string;
  landingSubtagline: string;
  landingHeroTitle: string;
  landingHeroSubtitle: string;
  landingCTA: string;
  landingToolsSection: string;
  landingToolsSubtitle: string;
  landingOpenTool: string;
  landingBadge: string;
  landingFeatureNoInstall: string;
  landingFeatureFree: string;
  landingFeaturePrivate: string;
  landingEditorDesc: string;
  landingVideoDesc: string;
  landingSpriteDesc: string;
  landingSoundDesc: string;
  landingConverterDesc: string;
  landingIconsDesc: string;

  // Copyright
  copyright: string;
}

const translations: Record<Language, Translations> = {
  ko: {
    // Header
    spriteEditor: "스프라이트 에디터",
    imageEditor: "이미지 에디터",
    imageConverter: "이미지 컨버터",
    soundEditor: "사운드 에디터",
    videoEditor: "비디오 에디터",
    iconShowcase: "아이콘 쇼케이스",

    // Settings menu
    settings: "설정",
    theme: "테마",
    language: "언어",
    light: "라이트",
    dark: "다크",
    system: "시스템",
    korean: "한국어",
    english: "English",

    // Common actions
    new: "새로만들기",
    open: "열기",
    save: "저장",
    saveAs: "다른이름",
    load: "불러오기",
    delete: "삭제",
    cancel: "취소",
    confirm: "확인",
    close: "닫기",
    reset: "초기화",

    // Menu
    file: "파일",
    view: "보기",
    window: "창",
    importImage: "이미지 가져오기",
    loading: "로딩 중...",

    // View menu
    showRulers: "눈금자 표시",
    showGuides: "가이드 표시",
    lockGuides: "가이드 잠금",
    snapToGuides: "가이드 스냅",
    clearGuides: "가이드 모두 삭제",
    panelHeaders: "패널 헤더",

    // Sprite editor
    importSheet: "시트 가져오기",
    pen: "펜",
    select: "선택",
    hand: "손",
    undo: "실행취소",
    redo: "다시실행",
    rotate: "회전",
    complete: "완성",
    points: "점",
    frame: "프레임",
    frames: "프레임",
    selected: "선택됨",
    point: "점",
    newProject: "새 프로젝트",
    projectName: "프로젝트명",
    otherName: "다른이름",
    savedProjects: "저장된 프로젝트",
    noSavedProjects: "저장된 프로젝트가 없습니다",
    storage: "저장소",
    export: "내보내기",
    resampleAllResolution: "전체 해상도 리샘플",
    resampleUseCurrentSize: "현재 캔버스 크기 사용",
    resampleQualitySmooth: "부드럽게 (고품질)",
    resampleQualityBalanced: "기본 (중간 보간)",
    resampleQualityPixel: "픽셀 유지 (보간 없음)",
    resampleQualityHint: "축소 시 smooth가 가장 자연스럽고, pixel은 도트 느낌을 유지합니다.",
    resampling: "리샘플링 중...",
    exportLayers: "레이어 개별 내보내기",
    import: "가져오기",
    importComplete: "가져오기 완료!",
    added: "추가됨",
    skipped: "건너뜀",
    deleteConfirm: "정말 삭제하시겠습니까?",
    newProjectConfirm: "현재 작업이 삭제됩니다. 새 프로젝트를 시작하시겠습니까?",
    noFramesToSave: "저장할 프레임이 없습니다.",
    saving: "저장 중…",
    saved: "저장됨",
    saveFailed: "저장 실패",
    deleteFailed: "삭제 실패",
    importFailed: "가져오기 실패",
    exportFailed: "내보내기 실패",
    exportType: "내보내기 형식",
    exportTypeZip: "PNG ZIP (개별 프레임)",
    exportTypeSpriteSheetPng: "스프라이트 시트 (PNG)",
    exportTypeSpriteSheetWebp: "스프라이트 시트 (WebP)",
    exportTypeMp4: "MP4 (H.264)",
    exportColumns: "열 수",
    exportColumnsAuto: "자동",
    exportCanvasSize: "캔버스 크기",
    exportUseSourceSize: "원본 캔버스 크기 사용",
    exportWidth: "W",
    exportHeight: "H",
    exportKeepAspectRatio: "비율 고정",
    exportCanvasSizeLimit: "최대 {max} x {max}",
    exportPadding: "여백",
    exportBgTransparent: "투명",
    exportLoopCount: "반복 횟수",
    exporting: "내보내는 중...",
    exportFileName: "파일 이름",
    exportTypeOptimizedZip: "최적화 스프라이트 (ZIP)",
    exportOptimizedTarget: "대상 프레임워크",
    exportOptimizedThreshold: "픽셀 허용치",
    exportOptimizedThresholdHint: "0은 완전 동일 픽셀만 고정 영역으로 처리합니다. 값을 높이면 미세한 떨림/노이즈를 무시합니다.",
    exportOptimizedIncludeGuide: "AI 코딩 가이드 포함",
    exportOptimizedImageFormat: "이미지 포맷",
    exportOptimizedFormatPng: "PNG (무손실)",
    exportOptimizedFormatWebp: "WebP (권장)",
    exportOptimizedTileSize: "타일 크기",
    enterProjectName: "프로젝트 이름을 입력하세요:",
    importOverwriteConfirm: "기존 프로젝트를 모두 삭제하고 가져오시겠습니까?",
    noFrames: "프레임 없음",

    // Converter
    format: "포맷",
    quality: "품질",
    converting: "변환 중...",
    convertAll: "모두 변환",
    downloadAll: "모두 다운로드",
    clear: "비우기",
    files: "파일",
    addMore: "추가하기",
    download: "다운로드",
    flipHorizontal: "좌우 반전",
    resize: "리사이즈",
    maxSidePx: "최대 변(px)",

    // Editor
    crop: "자르기",
    zoom: "확대",
    brush: "브러시",
    eraser: "지우개",
    magicWand: "마법봉",
    eyedropper: "스포이드",
    stamp: "도장",
    marquee: "선택",
    move: "이동",
    fill: "채우기",
    layers: "레이어",
    layer: "레이어",
    newCanvas: "새 캔버스",
    clearEditConfirm: "모든 편집 내용을 지우시겠습니까?",
    minOneLayerRequired: "최소 1개의 레이어가 필요합니다.",
    unsavedChangesConfirm: "현재 작업을 저장하지 않고 새 캔버스를 만드시겠습니까?",
    cloneStamp: "복제 도장",
    zoomInOut: "확대/축소",
    rotateLeft: "왼쪽 회전",
    rotateRight: "오른쪽 회전",
    zoomIn: "확대",
    zoomOut: "축소",
    fitToScreen: "화면에 맞추기",
    panLockOn: "터치 팬 잠금 ON",
    panLockOff: "터치 팬 잠금 OFF",
    addLayer: "새 레이어 추가",
    hideLayer: "레이어 숨기기",
    showLayer: "레이어 보이기",
    moveUp: "위로 이동",
    moveDown: "아래로 이동",
    deleteLayer: "레이어 삭제",
    mergeDown: "아래 레이어와 병합",
    openLayerPanel: "레이어 패널 열기",
    size: "크기",
    hardness: "경도",
    feather: "패더",
    presets: "프리셋",
    pressure: "압력",
    builtIn: "기본",
    color: "색상",
    source: "소스",
    altClickToSetSource: "Alt+클릭으로 소스 지정",
    resetEdit: "편집 초기화",
    opacity: "불투명도",
    closePanel: "패널 닫기",

    // Composition Layers Panel
    lockLayer: "레이어 잠금",
    unlockLayer: "레이어 잠금 해제",
    duplicateLayer: "레이어 복제",
    noLayersYet: "레이어가 없습니다",
    clickAddLayerToStart: "이미지를 추가하여 시작하세요",
    layerCount: "개 레이어",

    // ImageDropZone
    dragOrClickToOpen: "이미지를 드래그하거나 클릭하여 열기",
    selectImageForSprite: "스프라이트 편집을 위한 이미지를 선택하세요",
    startImageEditing: "이미지 편집을 시작하세요",
    dragOrClickToSelect: "이미지들을 드래그하거나 클릭하여 선택",
    selectImagesToConvert: "변환할 이미지를 선택하세요",

    // Tooltips
    clickToAddPoint: "클릭: 점 추가",
    firstPointToComplete: "첫점: 완성",
    clickToSelect: "클릭: 선택",
    dragToMove: "드래그: 이동",
    dragToPan: "드래그: 화면 이동",
    spaceAltToPan: "Space/Alt: 화면이동",
    wheelToZoom: "휠: 줌",
    penToolTip: "펜 툴 (폴리곤 그리기)",
    selectToolTip: "선택 툴 (이동/편집)",
    handToolTip: "손 툴 (화면 이동)",
    brushToolTip: "그리기 도구",
    eraserToolTip: "편집 레이어 지우기",
    fillToolTip: "선택 영역 또는 전체를 색으로 채움",
    eyedropperToolTip: "클릭한 위치의 색상 추출",
    cloneStampToolTip: "Alt+클릭으로 복제 소스 지정",
    cropToolTip: "영역 지정 후 Export로 잘라내기",
    zoomToolTip: "클릭: 확대 | Alt+클릭: 축소",
    magicWandToolTip: "클릭한 픽셀과 연결된 유사 색상 영역 선택",
    moveToolTip: "선택 영역 이동",

    // Timeline
    reorderMode: "순서 변경 모드",
    offsetMode: "위치 조정 모드",
    deleteFrame: "프레임 삭제",
    resetToOriginal: "원본으로 초기화",
    backgroundRemovalMode: "배경 삭제 모드",
    removeBackground: "AI 배경 삭제",
    removingBackground: "배경 삭제 중...",
    backgroundRemovalFailed: "배경 삭제에 실패했습니다. 다시 시도해주세요.",
    connectedAreaOnly: "연결된 영역만 삭제",
    allSameColor: "같은 색상 모두 삭제",

    // Animation Preview
    noFramesAvailable: "프레임이 없습니다",
    pause: "정지",
    play: "재생",
    scale: "확대",
    background: "배경",
    transparent: "투명 (체커보드)",
    customColor: "커스텀 색상",
    uploadBgImage: "배경 이미지 업로드",
    image: "이미지",
    removeBgImage: "배경 이미지 제거",
    colorBlack: "검정",
    colorWhite: "흰색",
    colorGray: "회색",
    colorSky: "하늘",
    colorGreen: "초록",
    colorPink: "분홍",

    // Frame Preview
    brushDraw: "브러시 (그리기)",
    colorPickerTip: "스포이드 (색상 추출)",
    tolerance: "허용치",
    selectFrame: "프레임을 선택하세요",
    previous: "이전",
    next: "다음",
    removeBackgroundTip: "배경 삭제 (클릭으로 배경 제거)",

    // Timeline Controls
    reorder: "순서",
    offset: "위치",
    animation: "애니메이션",
    frameWindow: "프레임",

    // Video Import
    importVideo: "비디오 가져오기",
    videoImport: "비디오 가져오기",
    extractFrames: "프레임 추출",
    everyNthFrame: "N번째 프레임마다",
    timeInterval: "시간 간격",
    seconds: "초",
    extracting: "추출 중...",
    maxFrames: "최대 프레임",
    importSelected: "선택 항목 가져오기",
    selectVideo: "비디오를 선택하세요",
    videoPreview: "비디오 미리보기",
    extractionSettings: "추출 설정",
    extractedFrames: "추출된 프레임",
    noFramesExtracted: "추출된 프레임이 없습니다",
    selectAll: "전체 선택",
    deselectAll: "전체 해제",
    framesSelected: "개 선택됨",

    // Frame Background Removal
    removingBackgroundDesc: "AI 모델을 사용해 선택된 프레임의 배경을 자동으로 제거합니다.",
    frameBackgroundRemoval: "선택된 프레임의 배경이 제거됩니다.",
    firstRunDownload: "첫 실행 시 AI 모델을 다운로드합니다 (~30MB)",
    selectFrameForBgRemoval: "배경을 제거할 프레임을 선택하세요.",
    frameImageNotFound: "프레임 이미지를 찾을 수 없습니다.",
    removeBackgroundCurrentFrame: "현재 프레임",
    removeBackgroundSelectedFrames: "선택된 프레임",
    removeBackgroundAllFrames: "모든 프레임",
    processingFrameProgress: "프레임 처리 중",

    // Frame Interpolation
    frameInterpolation: "AI 프레임 보간",
    frameInterpolationDescription: "선택한 프레임 사이에 AI로 중간 프레임을 생성합니다.",
    aiSelection: "AI 선택",
    aiSelectionDescription: "AI로 피사체/배경 경계를 분석해 클릭 위치 기준으로 영역을 선택합니다.",
    interpolationFirstRunDownload: "첫 실행 시 AI 모델을 다운로드합니다 (~22MB)",
    interpolationSteps: "구간당 생성 프레임 수",
    interpolationQuality: "품질 모드",
    interpolationQualityFast: "빠름",
    interpolationQualityHigh: "고품질",
    interpolationQualityFastHint: "속도 우선",
    interpolationQualityHighHint: "느리지만 더 자연스러움",
    interpolationEstimatedFrames: "예상 생성 프레임",
    selectFramesForInterpolation: "보간하려면 이미지가 있는 프레임 2개 이상을 선택하세요.",
    interpolationFailed: "프레임 보간에 실패했습니다. 다시 시도해주세요.",
    interpolationProgress: "프레임 보간 중",

    // Layout components
    floatingMode: "플로팅으로 전환",
    undock: "언도킹",
    dockLeft: "◀ 왼쪽",
    dockRight: "오른쪽 ▶",
    dockTop: "▲ 위",
    dockBottom: "▼ 아래",

    // Video Editor
    edit: "편집",
    openProject: "프로젝트 열기",
    importMedia: "미디어 가져오기",
    exportVideo: "비디오 내보내기",
    cut: "잘라내기",
    copy: "복사",
    paste: "붙여넣기",
    timeline: "타임라인",
    trim: "트림",
    trimDesc: "클립 시작/끝점 조정",
    razor: "자르기",
    razorDesc: "커서 위치에서 클립 분할",
    mask: "마스크",
    maskDesc: "클립에 마스크 그리기",
    paintMask: "마스크 칠하기",
    eraseMask: "마스크 지우기",
    rectangleMask: "사각형 마스크",
    fillMask: "마스크 채우기",
    clearMask: "마스크 비우기",
    longPressToEdit: "길게 눌러서 편집",
    selectDesc: "클립 선택 및 이동",
    duplicate: "복제",
    duplicateDesc: "선택한 클립을 새 트랙에 복제",
    stop: "정지",
    previousFrame: "이전 프레임",
    nextFrame: "다음 프레임",
    includeAudio: "오디오 포함",
    compression: "압축",
    backgroundColor: "배경색",
    compressionHighQuality: "고품질 (큰 용량)",
    compressionBalanced: "균형 (권장)",
    compressionSmallFile: "고압축 (작은 용량)",
    dropMediaHere: "미디어 파일을 여기에 드롭",
    dropMediaDesc: "비디오 또는 이미지 파일을 드래그하여 추가",
    dropOrClickToImport: "클릭하거나 파일을 드래그하세요",
    supportedFormats: "이미지, 영상 파일",
    resetLayout: "기본 레이아웃으로 복원",
    previewVideoCache: "프리뷰 비디오 캐시",

    // Landing page
    landingTagline: "웹 기반 크리에이티브 도구 모음",
    landingSubtagline: "이미지, 비디오, 스프라이트, 사운드를 브라우저에서 바로 편집하세요",
    landingHeroTitle: "브라우저에서 바로 창작하세요",
    landingHeroSubtitle: "설치 없이, 무료로. 이미지, 비디오, 스프라이트, 사운드 편집을 위한 웹 도구 모음",
    landingCTA: "시작하기",
    landingToolsSection: "크리에이티브 도구",
    landingToolsSubtitle: "브라우저에서 바로 사용할 수 있는 6가지 전문 도구",
    landingOpenTool: "사용하기 →",
    landingBadge: "무료 · 설치 불필요 · 브라우저에서 바로",
    landingFeatureNoInstall: "설치 불필요",
    landingFeatureFree: "완전 무료",
    landingFeaturePrivate: "프라이버시 보장",
    landingEditorDesc: "레이어, 브러시, AI 배경 제거",
    landingVideoDesc: "타임라인, 마스킹, 멀티트랙",
    landingSpriteDesc: "프레임 추출, 애니메이션 미리보기",
    landingSoundDesc: "파형 편집, 포맷 변환",
    landingConverterDesc: "WebP, PNG, JPEG 간 포맷 변환",
    landingIconsDesc: "아이콘 검색, SVG 복사 및 다운로드",

    // Copyright
    copyright: "© 2026 Soo Hong Kim. All rights reserved.",
  },
  en: {
    // Header
    spriteEditor: "Sprite Editor",
    imageEditor: "Image Editor",
    imageConverter: "Image Converter",
    soundEditor: "Sound Editor",
    videoEditor: "Video Editor",
    iconShowcase: "Icon Showcase",

    // Settings menu
    settings: "Settings",
    theme: "Theme",
    language: "Language",
    light: "Light",
    dark: "Dark",
    system: "System",
    korean: "한국어",
    english: "English",

    // Common actions
    new: "New",
    open: "Open",
    save: "Save",
    saveAs: "Save As",
    load: "Load",
    delete: "Delete",
    cancel: "Cancel",
    confirm: "Confirm",
    close: "Close",
    reset: "Reset",

    // Menu
    file: "File",
    view: "View",
    window: "Window",
    importImage: "Import Image",
    loading: "Loading...",

    // View menu
    showRulers: "Show Rulers",
    showGuides: "Show Guides",
    lockGuides: "Lock Guides",
    snapToGuides: "Snap to Guides",
    clearGuides: "Clear All Guides",
    panelHeaders: "Panel Headers",

    // Sprite editor
    importSheet: "Import Sheet",
    pen: "Pen",
    select: "Select",
    hand: "Hand",
    undo: "Undo",
    redo: "Redo",
    rotate: "Rotate",
    complete: "Complete",
    points: "points",
    frame: "Frame",
    frames: "frames",
    selected: "selected",
    point: "point",
    newProject: "New Project",
    projectName: "Project Name",
    otherName: "Save As",
    savedProjects: "Saved Projects",
    noSavedProjects: "No saved projects",
    storage: "Storage",
    export: "Export",
    resampleAllResolution: "Resample All Resolution",
    resampleUseCurrentSize: "Use current canvas size",
    resampleQualitySmooth: "Smooth (High quality)",
    resampleQualityBalanced: "Balanced (Medium smoothing)",
    resampleQualityPixel: "Pixel Preserve (No smoothing)",
    resampleQualityHint: "For downscale, smooth looks most natural. Use pixel to keep crisp pixel-art edges.",
    resampling: "Resampling...",
    exportLayers: "Export Layers",
    import: "Import",
    importComplete: "Import complete!",
    added: "added",
    skipped: "skipped",
    deleteConfirm: "Are you sure you want to delete?",
    newProjectConfirm: "Current work will be lost. Start a new project?",
    noFramesToSave: "No frames to save.",
    saving: "Saving…",
    saved: "Saved",
    saveFailed: "Save failed",
    deleteFailed: "Delete failed",
    importFailed: "Import failed",
    exportFailed: "Export failed",
    exportType: "Export Type",
    exportTypeZip: "PNG ZIP (Individual Frames)",
    exportTypeSpriteSheetPng: "Sprite Sheet (PNG)",
    exportTypeSpriteSheetWebp: "Sprite Sheet (WebP)",
    exportTypeMp4: "MP4 (H.264)",
    exportColumns: "Columns",
    exportColumnsAuto: "Auto",
    exportCanvasSize: "Canvas Size",
    exportUseSourceSize: "Use source canvas size",
    exportWidth: "W",
    exportHeight: "H",
    exportKeepAspectRatio: "Keep aspect ratio",
    exportCanvasSizeLimit: "Max {max} x {max}",
    exportPadding: "Padding",
    exportBgTransparent: "Transparent",
    exportLoopCount: "Loop Count",
    exporting: "Exporting...",
    exportFileName: "File Name",
    exportTypeOptimizedZip: "Optimized Sprite (ZIP)",
    exportOptimizedTarget: "Target Framework",
    exportOptimizedThreshold: "Pixel Threshold",
    exportOptimizedThresholdHint: "0 keeps only exact matches as static. Increase slightly to ignore tiny flicker/noise.",
    exportOptimizedIncludeGuide: "Include AI Coding Guide",
    exportOptimizedImageFormat: "Image Format",
    exportOptimizedFormatPng: "PNG (Lossless)",
    exportOptimizedFormatWebp: "WebP (Recommended)",
    exportOptimizedTileSize: "Tile Size",
    enterProjectName: "Enter project name:",
    importOverwriteConfirm: "Delete all existing projects and import?",
    noFrames: "No frames",

    // Converter
    format: "Format",
    quality: "Quality",
    converting: "Converting...",
    convertAll: "Convert All",
    downloadAll: "Download All",
    clear: "Clear",
    files: "files",
    addMore: "Add more",
    download: "Download",
    flipHorizontal: "Flip Horizontal",
    resize: "Resize",
    maxSidePx: "Max side (px)",

    // Editor
    crop: "Crop",
    zoom: "Zoom",
    brush: "Brush",
    eraser: "Eraser",
    magicWand: "Magic Wand",
    eyedropper: "Eyedropper",
    stamp: "Stamp",
    marquee: "Marquee",
    move: "Move",
    fill: "Fill",
    layers: "Layers",
    layer: "Layer",
    newCanvas: "New Canvas",
    clearEditConfirm: "Clear all edits?",
    minOneLayerRequired: "At least one layer is required.",
    unsavedChangesConfirm: "Create new canvas without saving?",
    cloneStamp: "Clone Stamp",
    zoomInOut: "Zoom In/Out",
    rotateLeft: "Rotate Left",
    rotateRight: "Rotate Right",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    fitToScreen: "Fit to Screen",
    panLockOn: "Touch Pan Lock ON",
    panLockOff: "Touch Pan Lock OFF",
    addLayer: "Add Layer",
    hideLayer: "Hide Layer",
    showLayer: "Show Layer",
    moveUp: "Move Up",
    moveDown: "Move Down",
    deleteLayer: "Delete Layer",
    mergeDown: "Merge Down",
    openLayerPanel: "Open Layer Panel",
    size: "Size",
    hardness: "Hardness",
    feather: "Feather",
    presets: "Presets",
    pressure: "Pressure",
    builtIn: "Built-in",
    color: "Color",
    source: "Source",
    altClickToSetSource: "Alt+click to set source",
    resetEdit: "Reset Edit",
    opacity: "Opacity",
    closePanel: "Close Panel",

    // Composition Layers Panel
    lockLayer: "Lock Layer",
    unlockLayer: "Unlock Layer",
    duplicateLayer: "Duplicate Layer",
    noLayersYet: "No layers yet",
    clickAddLayerToStart: "Add an image to start",
    layerCount: "layers",

    // ImageDropZone
    dragOrClickToOpen: "Drag or click to open image",
    selectImageForSprite: "Select an image for sprite editing",
    startImageEditing: "Start image editing",
    dragOrClickToSelect: "Drag or click to select images",
    selectImagesToConvert: "Select images to convert",

    // Tooltips
    clickToAddPoint: "Click: Add point",
    firstPointToComplete: "First point: Complete",
    clickToSelect: "Click: Select",
    dragToMove: "Drag: Move",
    dragToPan: "Drag: Pan",
    spaceAltToPan: "Space/Alt: Pan",
    wheelToZoom: "Wheel: Zoom",
    penToolTip: "Pen tool (draw polygon)",
    selectToolTip: "Select tool (move/edit)",
    handToolTip: "Hand tool (pan canvas)",
    brushToolTip: "Drawing tool",
    eraserToolTip: "Erase edit layer",
    fillToolTip: "Fill selection or entire canvas",
    eyedropperToolTip: "Pick color from canvas",
    cloneStampToolTip: "Alt+click to set clone source",
    cropToolTip: "Select area and export to crop",
    zoomToolTip: "Click: Zoom in | Alt+click: Zoom out",
    magicWandToolTip: "Select connected pixels similar to clicked color",
    moveToolTip: "Move selection",

    // Timeline
    reorderMode: "Reorder Mode",
    offsetMode: "Offset Mode",
    deleteFrame: "Delete Frame",
    resetToOriginal: "Reset to Original",
    backgroundRemovalMode: "Background Removal Mode",
    removeBackground: "AI Remove BG",
    removingBackground: "Removing background...",
    backgroundRemovalFailed: "Background removal failed. Please try again.",
    connectedAreaOnly: "Connected area only",
    allSameColor: "All same color",

    // Animation Preview
    noFramesAvailable: "No frames available",
    pause: "Pause",
    play: "Play",
    scale: "Scale",
    background: "Background",
    transparent: "Transparent (checkerboard)",
    customColor: "Custom color",
    uploadBgImage: "Upload background image",
    image: "Image",
    removeBgImage: "Remove background image",
    colorBlack: "Black",
    colorWhite: "White",
    colorGray: "Gray",
    colorSky: "Sky",
    colorGreen: "Green",
    colorPink: "Pink",

    // Frame Preview
    brushDraw: "Brush (draw)",
    colorPickerTip: "Eyedropper (pick color)",
    tolerance: "Tolerance",
    selectFrame: "Select a frame",
    previous: "Prev",
    next: "Next",
    removeBackgroundTip: "Remove background (click to remove)",

    // Timeline Controls
    reorder: "Reorder",
    offset: "Offset",
    animation: "Animation",
    frameWindow: "Frame",

    // Video Import
    importVideo: "Import Video",
    videoImport: "Import Video",
    extractFrames: "Extract Frames",
    everyNthFrame: "Every Nth Frame",
    timeInterval: "Time Interval",
    seconds: "seconds",
    extracting: "Extracting...",
    maxFrames: "Max Frames",
    importSelected: "Import Selected",
    selectVideo: "Select a video",
    videoPreview: "Video Preview",
    extractionSettings: "Extraction Settings",
    extractedFrames: "Extracted Frames",
    noFramesExtracted: "No frames extracted",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    framesSelected: "selected",

    // Frame Background Removal
    removingBackgroundDesc: "Automatically remove the background from the selected frame using AI.",
    frameBackgroundRemoval: "The background of the selected frame will be removed.",
    firstRunDownload: "First run will download the AI model (~30MB)",
    selectFrameForBgRemoval: "Please select a frame to remove background.",
    frameImageNotFound: "Frame image not found.",
    removeBackgroundCurrentFrame: "Current Frame",
    removeBackgroundSelectedFrames: "Selected Frames",
    removeBackgroundAllFrames: "All Frames",
    processingFrameProgress: "Processing frames",

    // Frame Interpolation
    frameInterpolation: "AI Frame Interpolation",
    frameInterpolationDescription: "Generate in-between frames between selected frames using AI.",
    aiSelection: "AI Selection",
    aiSelectionDescription: "Use AI segmentation and select foreground/background based on the clicked point.",
    interpolationFirstRunDownload: "First run will download the AI model (~22MB)",
    interpolationSteps: "Frames per gap",
    interpolationQuality: "Quality mode",
    interpolationQualityFast: "Fast",
    interpolationQualityHigh: "High Quality",
    interpolationQualityFastHint: "Prioritize speed",
    interpolationQualityHighHint: "Slower but smoother motion",
    interpolationEstimatedFrames: "Estimated generated frames",
    selectFramesForInterpolation: "Select at least 2 frames with images for interpolation.",
    interpolationFailed: "Frame interpolation failed. Please try again.",
    interpolationProgress: "Interpolating frames",

    // Layout components
    floatingMode: "Float window",
    undock: "Undock",
    dockLeft: "◀ Left",
    dockRight: "Right ▶",
    dockTop: "▲ Top",
    dockBottom: "▼ Bottom",

    // Video Editor
    edit: "Edit",
    openProject: "Open Project",
    importMedia: "Import Media",
    exportVideo: "Export Video",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    timeline: "Timeline",
    trim: "Trim",
    trimDesc: "Adjust clip in/out points",
    razor: "Razor",
    razorDesc: "Split clip at cursor position",
    mask: "Mask",
    maskDesc: "Draw mask on clip",
    paintMask: "Paint mask",
    eraseMask: "Erase mask",
    rectangleMask: "Rectangle mask",
    fillMask: "Fill mask",
    clearMask: "Clear mask",
    longPressToEdit: "Long-press to edit",
    selectDesc: "Select and move clips",
    duplicate: "Duplicate",
    duplicateDesc: "Duplicate selected clip to new track",
    stop: "Stop",
    previousFrame: "Previous Frame",
    nextFrame: "Next Frame",
    includeAudio: "Include Audio",
    compression: "Compression",
    backgroundColor: "Background Color",
    compressionHighQuality: "High Quality (Large File)",
    compressionBalanced: "Balanced (Recommended)",
    compressionSmallFile: "High Compression (Small File)",
    dropMediaHere: "Drop media files here",
    dropMediaDesc: "Drag video or image files to add",
    dropOrClickToImport: "Click or drag files here",
    supportedFormats: "Images, video files",
    resetLayout: "Reset to Default Layout",
    previewVideoCache: "Preview Video Cache",

    // Landing page
    landingTagline: "Web-based Creative Toolkit",
    landingSubtagline: "Edit images, video, sprites, and sound right in your browser",
    landingHeroTitle: "Create directly in your browser",
    landingHeroSubtitle: "Free, no installation required. Web tools for image, video, sprite, and sound editing",
    landingCTA: "Get Started",
    landingToolsSection: "Creative Tools",
    landingToolsSubtitle: "Six professional tools you can use right in your browser",
    landingOpenTool: "Open →",
    landingBadge: "Free · No Install · Browser-based",
    landingFeatureNoInstall: "No Installation",
    landingFeatureFree: "Completely Free",
    landingFeaturePrivate: "Privacy First",
    landingEditorDesc: "Layers, brushes, AI background removal",
    landingVideoDesc: "Timeline, masking, multi-track",
    landingSpriteDesc: "Frame extraction, animation preview",
    landingSoundDesc: "Waveform editing, format conversion",
    landingConverterDesc: "Convert between WebP, PNG, JPEG",
    landingIconsDesc: "Search icons, copy SVG, download",

    // Copyright
    copyright: "© 2026 Soo Hong Kim. All rights reserved.",
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "artkit-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ko");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && (stored === "ko" || stored === "en")) {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
