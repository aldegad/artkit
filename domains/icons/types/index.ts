export interface IconMeta {
  name: string;
  component: React.FC<{ className?: string }>;
  category: IconCategory;
  tags: string[];
}

export type IconCategory =
  | "navigation"
  | "media"
  | "editorTools"
  | "layers"
  | "fileActions"
  | "theme"
  | "brushPresets"
  | "videoTimeline"
  | "videoTools"
  | "crop"
  | "sidebar";
