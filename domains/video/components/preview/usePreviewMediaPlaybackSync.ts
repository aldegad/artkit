"use client";

import { useCallback, useEffect, MutableRefObject, RefObject, useMemo, useRef } from "react";
import { PLAYBACK } from "../../constants";
import {
  AudioClip,
  Clip,
  PlaybackState,
  VideoClip,
  VideoTrack,
  getClipPlaybackSpeed,
  getSourceTime,
} from "../../types";
import { subscribeImmediatePlaybackStop } from "../../utils/playbackStopSignal";
import {
  buildPlaybackTrackClipIndex,
  isAudibleMediaClip,
  resolvePlaybackMediaSnapshot,
} from "../../utils/playbackActiveMedia";

interface UsePreviewMediaPlaybackSyncOptions {
  tracks: VideoTrack[];
  clips: Clip[];
  playback: PlaybackState;
  directPreviewOptimized: boolean;
  currentTimeRef: RefObject<number>;
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  videoElementsRef: RefObject<Map<string, HTMLVideoElement>>;
  audioElementsRef: RefObject<Map<string, HTMLAudioElement>>;
  isWebAudioReadyRef: MutableRefObject<(sourceUrl: string) => boolean>;
  syncMediaRef: MutableRefObject<((request?: { forceVideoCurrentTimeSync?: boolean }) => void) | null>;
  syncMediaIntervalRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lastPlaybackTickTimeRef: MutableRefObject<number | null>;
  wasPlayingRef: MutableRefObject<boolean>;
}

function hasFiniteMediaDuration(media: HTMLMediaElement): boolean {
  return Number.isFinite(media.duration) && media.duration > 0;
}

export function usePreviewMediaPlaybackSync(options: UsePreviewMediaPlaybackSyncOptions) {
  const {
    tracks,
    clips,
    playback,
    directPreviewOptimized,
    currentTimeRef,
    videoElementsRef,
    audioElementsRef,
    isWebAudioReadyRef,
    syncMediaRef,
    syncMediaIntervalRef,
    lastPlaybackTickTimeRef,
    wasPlayingRef,
  } = options;
  const lastActiveVideoClipIdByElementRef = useRef(new Map<HTMLVideoElement, string>());
  const clipsByTrack = useMemo(() => buildPlaybackTrackClipIndex(clips), [clips]);
  const activeTracks = useMemo(
    () => tracks.filter((track) => track.visible && !track.muted),
    [tracks],
  );

  const stopAllMediaElements = useCallback(() => {
    videoElementsRef.current?.forEach((video) => {
      video.pause();
      video.muted = true;
      video.volume = 0;
    });

    audioElementsRef.current?.forEach((audio) => {
      audio.pause();
      audio.muted = true;
      audio.volume = 0;
    });
  }, [videoElementsRef, audioElementsRef]);

  const clearScheduledSync = useCallback(() => {
    if (syncMediaIntervalRef.current !== null) {
      clearTimeout(syncMediaIntervalRef.current);
      syncMediaIntervalRef.current = null;
    }
  }, [syncMediaIntervalRef]);

  const forceStopMediaImmediately = useCallback(() => {
    clearScheduledSync();
    syncMediaRef.current = null;
    lastPlaybackTickTimeRef.current = null;
    lastActiveVideoClipIdByElementRef.current.clear();
    stopAllMediaElements();
  }, [clearScheduledSync, lastPlaybackTickTimeRef, stopAllMediaElements, syncMediaRef]);

  useEffect(() => {
    return subscribeImmediatePlaybackStop(forceStopMediaImmediately);
  }, [forceStopMediaImmediately]);

  // Handle playback state changes - sync video/audio elements.
  // Runs only when play state or clip/track structure changes, NOT every frame.
  useEffect(() => {
    if (!playback.isPlaying) {
      forceStopMediaImmediately();
      wasPlayingRef.current = false;
      return;
    }

    const activeVideoClipIdsByElement = lastActiveVideoClipIdByElementRef.current;
    const trackById = new Map(activeTracks.map((track) => [track.id, track]));

    const syncMedia = (request?: { forceVideoCurrentTimeSync?: boolean }) => {
      const ct = currentTimeRef.current || 0;
      const desiredVideoStates = new Map<
        HTMLVideoElement,
        { clip: VideoClip; isAudible: boolean }
      >();
      const desiredAudioStates = new Map<HTMLAudioElement, AudioClip>();
      const playbackSnapshot = resolvePlaybackMediaSnapshot({
        tracks: activeTracks,
        clipsByTrack,
        time: ct,
      });

      for (const clip of playbackSnapshot.activeVideoClips) {
        const video = videoElementsRef.current?.get(clip.id);
        if (!video || video.readyState < 2) continue;
        desiredVideoStates.set(video, {
          clip,
          isAudible: isAudibleMediaClip(clip),
        });
      }

      for (const clip of playbackSnapshot.activeAudioClips) {
        const audio = audioElementsRef.current?.get(clip.id);
        if (!audio || !isAudibleMediaClip(clip)) continue;
        desiredAudioStates.set(audio, clip);
      }

      const uniqueVideos = new Set(videoElementsRef.current?.values() || []);
      for (const video of uniqueVideos) {
        const desiredState = desiredVideoStates.get(video);
        if (!desiredState) {
          activeVideoClipIdsByElement.delete(video);
          video.pause();
          video.muted = true;
          video.volume = 0;
          continue;
        }

        const { clip } = desiredState;
        const track = trackById.get(clip.trackId);
        if (!track || !track.visible) {
          video.pause();
          video.muted = true;
          video.volume = 0;
          continue;
        }

        const sourceTime = getSourceTime(clip, ct);
        const videoSeekThreshold =
          desiredState.isAudible && !isWebAudioReadyRef.current(clip.sourceUrl)
            ? Math.max(PLAYBACK.SEEK_DRIFT_THRESHOLD, 0.45)
            : PLAYBACK.SEEK_DRIFT_THRESHOLD;
        const previousClipId = activeVideoClipIdsByElement.get(video) ?? null;
        const clipChanged = previousClipId !== null && previousClipId !== clip.id;
        const shouldForceCurrentTimeSync =
          Boolean(request?.forceVideoCurrentTimeSync) || clipChanged;
        const seekThreshold = shouldForceCurrentTimeSync ? 0.01 : videoSeekThreshold;
        if (
          Number.isFinite(sourceTime) &&
          hasFiniteMediaDuration(video) &&
          (!directPreviewOptimized || shouldForceCurrentTimeSync) &&
          Math.abs(video.currentTime - sourceTime) > seekThreshold
        ) {
          video.currentTime = sourceTime;
        }
        activeVideoClipIdsByElement.set(video, clip.id);

        video.playbackRate = playback.playbackRate * getClipPlaybackSpeed(clip);

        if (isWebAudioReadyRef.current(clip.sourceUrl)) {
          video.muted = true;
          video.volume = 0;
        } else {
          const clipVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
          video.muted = !desiredState.isAudible;
          video.volume = desiredState.isAudible
            ? Math.max(0, Math.min(1, clipVolume / 100))
            : 0;
        }

        if (video.paused) video.play().catch(() => {});
      }

      const uniqueAudios = new Set(audioElementsRef.current?.values() || []);
      for (const audio of uniqueAudios) {
        const clip = desiredAudioStates.get(audio);
        if (!clip) {
          audio.pause();
          audio.muted = true;
          audio.volume = 0;
          continue;
        }

        const track = trackById.get(clip.trackId);
        if (!track || !track.visible) {
          audio.pause();
          audio.muted = true;
          audio.volume = 0;
          continue;
        }

        if (isWebAudioReadyRef.current(clip.sourceUrl)) {
          audio.pause();
          audio.muted = true;
          audio.volume = 0;
          continue;
        }

        const sourceTime = getSourceTime(clip, ct);
        const audioSeekThreshold = Math.max(PLAYBACK.AUDIO_SEEK_DRIFT_THRESHOLD, 0.6);
        if (
          Number.isFinite(sourceTime) &&
          hasFiniteMediaDuration(audio) &&
          Math.abs(audio.currentTime - sourceTime) > audioSeekThreshold
        ) {
          audio.currentTime = sourceTime;
        }

        audio.playbackRate = playback.playbackRate * getClipPlaybackSpeed(clip);
        audio.muted = false;
        audio.volume = Math.max(0, Math.min(1, (clip.audioVolume ?? 100) / 100));

        if (audio.paused) audio.play().catch(() => {});
      }

      clearScheduledSync();
      if (!playback.isPlaying) return;

      const nextBoundaryMs = playbackSnapshot.nextBoundaryTime !== null
        ? Math.max(
          24,
          (((playbackSnapshot.nextBoundaryTime - ct) / Math.max(0.01, playback.playbackRate)) * 1000) + 32,
        )
        : Number.POSITIVE_INFINITY;
      const driftSyncMs = directPreviewOptimized ? 320 : 220;
      const nextSyncDelayMs = Math.max(24, Math.min(driftSyncMs, nextBoundaryMs));
      syncMediaIntervalRef.current = setTimeout(() => {
        syncMedia();
      }, nextSyncDelayMs);
    };

    syncMediaRef.current = syncMedia;
    syncMedia({ forceVideoCurrentTimeSync: true });
    wasPlayingRef.current = true;

    return () => {
      clearScheduledSync();
      syncMediaRef.current = null;
      activeVideoClipIdsByElement.clear();
      if (!playback.isPlaying) {
        stopAllMediaElements();
      }
    };
  }, [
    activeTracks,
    clipsByTrack,
    playback.isPlaying,
    playback.playbackRate,
    videoElementsRef,
    audioElementsRef,
    isWebAudioReadyRef,
    currentTimeRef,
    directPreviewOptimized,
    syncMediaRef,
    syncMediaIntervalRef,
    clearScheduledSync,
    stopAllMediaElements,
    forceStopMediaImmediately,
    wasPlayingRef,
  ]);

  // Hard-stop HTML media elements when the tab/window loses foreground.
  useEffect(() => {
    const stopWhenBackgrounded = () => {
      if (document.visibilityState !== "visible") {
        forceStopMediaImmediately();
      }
    };

    const stopNow = () => {
      forceStopMediaImmediately();
    };

    document.addEventListener("visibilitychange", stopWhenBackgrounded);
    window.addEventListener("blur", stopNow);
    window.addEventListener("pagehide", stopNow);

    return () => {
      document.removeEventListener("visibilitychange", stopWhenBackgrounded);
      window.removeEventListener("blur", stopNow);
      window.removeEventListener("pagehide", stopNow);
    };
  }, [forceStopMediaImmediately]);
}
