"use client";

import { HeaderContent } from "@/shared/components";
import EditorMenuBar from "./EditorMenuBar";

type EditorMenuBarProps = React.ComponentProps<typeof EditorMenuBar>;

export interface EditorHeaderProps extends EditorMenuBarProps {
  title: string;
  layersCount: number;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  projectNamePlaceholder: string;
}

export function EditorHeader({
  title,
  layersCount,
  projectName,
  onProjectNameChange,
  projectNamePlaceholder,
  ...menuBarProps
}: EditorHeaderProps) {
  return (
    <HeaderContent
      title={title}
      menuBar={<EditorMenuBar {...menuBarProps} />}
      projectName={
        layersCount > 0
          ? {
              value: projectName,
              onChange: onProjectNameChange,
              placeholder: projectNamePlaceholder,
            }
          : undefined
      }
      extra={layersCount > 0 ? <div className="flex-1" /> : undefined}
    />
  );
}
