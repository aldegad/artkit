"use client";

import { useCallback, useMemo } from "react";
import { Clip, VideoTrack, getClipScaleX, getClipScaleY } from "../../types";
import { resolveClipPositionAtTimelineTime } from "../../utils/clipTransformKeyframes";

interface Point {
  x: number;
  y: number;
}

interface UsePreviewCoordinateHelpersOptions {
  projectSize: { width: number; height: number };
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  vpScreenToContent: (point: Point) => Point;
  tracks: VideoTrack[];
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  currentTimeRef: React.RefObject<number>;
}

interface UsePreviewCoordinateHelpersResult {
  clampToCanvas: (point: Point) => Point;
  screenToProject: (clientX: number, clientY: number, allowOutside?: boolean) => Point | null;
  screenToMaskCoords: (clientX: number, clientY: number) => Point | null;
  hitTestClipAtPoint: (point: Point) => Clip | null;
}

export function usePreviewCoordinateHelpers(
  options: UsePreviewCoordinateHelpersOptions
): UsePreviewCoordinateHelpersResult {
  const { projectSize, previewContainerRef, vpScreenToContent, tracks, getClipAtTime, currentTimeRef } = options;
  const tracksById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);

  const clampToCanvas = useCallback((point: Point) => {
    return {
      x: Math.max(0, Math.min(projectSize.width, point.x)),
      y: Math.max(0, Math.min(projectSize.height, point.y)),
    };
  }, [projectSize.height, projectSize.width]);

  const screenToProject = useCallback((clientX: number, clientY: number, allowOutside: boolean = false) => {
    if (!previewContainerRef.current) return null;
    const point = vpScreenToContent({ x: clientX, y: clientY });

    if (!allowOutside && (
      point.x < 0
      || point.y < 0
      || point.x > projectSize.width
      || point.y > projectSize.height
    )) {
      return null;
    }

    return point;
  }, [previewContainerRef, vpScreenToContent, projectSize.width, projectSize.height]);

  // Mask uses project coordinates (not clip-local) since it's track-level
  const screenToMaskCoords = useCallback((clientX: number, clientY: number) => {
    const point = screenToProject(clientX, clientY, true);
    if (!point) return null;
    return {
      x: Math.max(0, Math.min(projectSize.width, point.x)),
      y: Math.max(0, Math.min(projectSize.height, point.y)),
    };
  }, [screenToProject, projectSize.height, projectSize.width]);

  const hitTestClipAtPoint = useCallback((point: Point): Clip | null => {
    // Top track (index 0) is foreground — check it first for hit testing
    for (const track of tracks) {
      if (!track.visible || track.locked) continue;
      const clip = getClipAtTime(track.id, currentTimeRef.current);
      if (!clip || !clip.visible || clip.type === "audio") continue;

      const position = resolveClipPositionAtTimelineTime(clip, currentTimeRef.current);
      const width = clip.sourceSize.width * getClipScaleX(clip);
      const height = clip.sourceSize.height * getClipScaleY(clip);
      const centerX = position.x + width / 2;
      const centerY = position.y + height / 2;
      const angle = ((clip.rotation || 0) * Math.PI) / 180;

      const dx = point.x - centerX;
      const dy = point.y - centerY;
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      const inside =
        localX >= -width / 2 &&
        localX <= width / 2 &&
        localY >= -height / 2 &&
        localY <= height / 2;

      const trackState = tracksById.get(clip.trackId);
      if (inside && trackState && !trackState.locked) {
        return clip;
      }
    }

    return null;
  }, [tracks, getClipAtTime, currentTimeRef, tracksById]);

  return {
    clampToCanvas,
    screenToProject,
    screenToMaskCoords,
    hitTestClipAtPoint,
  };
}
