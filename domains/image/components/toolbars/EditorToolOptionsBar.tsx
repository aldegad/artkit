"use client";

import { EditorToolMode } from "../../types";
import { EditorToolOptions, EditorToolOptionsProps } from "./EditorToolOptions";

type BaseProps = Omit<EditorToolOptionsProps, "translations" | "onCancelTransform">;

export interface EditorToolOptionsBarProps extends BaseProps {
  cancelTransform: () => void;
  setToolMode: (mode: EditorToolMode) => void;
  translations: EditorToolOptionsProps["translations"];
}

export function EditorToolOptionsBar({
  cancelTransform,
  setToolMode,
  translations,
  ...props
}: EditorToolOptionsBarProps) {
  return (
    <EditorToolOptions
      {...props}
      onCancelTransform={() => {
        cancelTransform();
        setToolMode("move");
      }}
      translations={translations}
    />
  );
}
