"use client";

import { useCallback, useEffect, MutableRefObject, RefObject } from "react";
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

interface UsePreviewMediaPlaybackSyncOptions {
  clips: Clip[];
  tracks: VideoTrack[];
  playback: PlaybackState;
  currentTimeRef: RefObject<number>;
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  videoElementsRef: RefObject<Map<string, HTMLVideoElement>>;
  audioElementsRef: RefObject<Map<string, HTMLAudioElement>>;
  isWebAudioReadyRef: MutableRefObject<(sourceUrl: string) => boolean>;
  syncMediaRef: MutableRefObject<(() => void) | null>;
  syncMediaIntervalRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  lastPlaybackTickTimeRef: MutableRefObject<number | null>;
  wasPlayingRef: MutableRefObject<boolean>;
}

function isAudibleMediaClip(clip: Clip): boolean {
  if (clip.type === "video") {
    return (clip.hasAudio ?? true)
      && !(clip.audioMuted ?? false)
      && (typeof clip.audioVolume === "number" ? clip.audioVolume : 100) > 0;
  }

  if (clip.type === "audio") {
    return !(clip.audioMuted ?? false)
      && (typeof clip.audioVolume === "number" ? clip.audioVolume : 100) > 0;
  }

  return false;
}

function hasFiniteMediaDuration(media: HTMLMediaElement): boolean {
  return Number.isFinite(media.duration) && media.duration > 0;
}

export function usePreviewMediaPlaybackSync(options: UsePreviewMediaPlaybackSyncOptions) {
  const {
    clips,
    tracks,
    playback,
    currentTimeRef,
    getClipAtTime,
    videoElementsRef,
    audioElementsRef,
    isWebAudioReadyRef,
    syncMediaRef,
    syncMediaIntervalRef,
    lastPlaybackTickTimeRef,
    wasPlayingRef,
  } = options;

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

  const forceStopMediaImmediately = useCallback(() => {
    if (syncMediaIntervalRef.current !== null) {
      clearInterval(syncMediaIntervalRef.current);
      syncMediaIntervalRef.current = null;
    }
    syncMediaRef.current = null;
    lastPlaybackTickTimeRef.current = null;
    stopAllMediaElements();
  }, [lastPlaybackTickTimeRef, stopAllMediaElements, syncMediaIntervalRef, syncMediaRef]);

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

    // Sync and start/stop media elements
    const syncMedia = () => {
      const ct = currentTimeRef.current || 0;
      const trackById = new Map(tracks.map((track) => [track.id, track]));
      const desiredVideoStates = new Map<
        HTMLVideoElement,
        { clip: VideoClip; isAudible: boolean }
      >();
      const desiredAudioStates = new Map<HTMLAudioElement, AudioClip>();

      for (const track of tracks) {
        if (!track.visible || track.muted) continue;
        const clip = getClipAtTime(track.id, ct);
        if (!clip || !clip.visible) continue;

        if (clip.type === "video") {
          const video = videoElementsRef.current?.get(clip.id);
          if (!video || video.readyState < 2) continue;
          desiredVideoStates.set(video, {
            clip,
            isAudible: isAudibleMediaClip(clip),
          });
          continue;
        }

        if (clip.type === "audio") {
          const audio = audioElementsRef.current?.get(clip.id);
          if (!audio) continue;
          if (!isAudibleMediaClip(clip)) continue;
          desiredAudioStates.set(audio, clip);
        }
      }

      const uniqueVideos = new Set(videoElementsRef.current?.values() || []);
      for (const video of uniqueVideos) {
        const desiredState = desiredVideoStates.get(video);
        if (!desiredState) {
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
        // During playback, use relaxed threshold to avoid re-seek storms that
        // stall the decoder and cause frozen frames. The video element is
        // already playing at the correct playbackRate — let it catch up
        // naturally instead of constantly interrupting with seeks.
        const videoSeekThreshold =
          desiredState.isAudible && !isWebAudioReadyRef.current(clip.sourceUrl)
            ? Math.max(PLAYBACK.PLAYBACK_SEEK_DRIFT_THRESHOLD, 0.8)
            : PLAYBACK.PLAYBACK_SEEK_DRIFT_THRESHOLD;
        if (
          Number.isFinite(sourceTime) &&
          hasFiniteMediaDuration(video) &&
          Math.abs(video.currentTime - sourceTime) > videoSeekThreshold
        ) {
          video.currentTime = sourceTime;
        }

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
    };

    syncMediaRef.current = syncMedia;
    syncMedia(); // Initial sync when playback starts
    // Periodic re-sync for clip boundaries and drift correction (not every frame)
    const intervalId = setInterval(syncMedia, PLAYBACK.SYNC_INTERVAL_MS);
    syncMediaIntervalRef.current = intervalId;
    wasPlayingRef.current = true;

    return () => {
      clearInterval(intervalId);
      if (syncMediaIntervalRef.current === intervalId) {
        syncMediaIntervalRef.current = null;
      }
      syncMediaRef.current = null;
      if (!playback.isPlaying) {
        stopAllMediaElements();
      }
    };
  }, [
    playback.isPlaying,
    playback.playbackRate,
    tracks,
    getClipAtTime,
    videoElementsRef,
    audioElementsRef,
    isWebAudioReadyRef,
    currentTimeRef,
    syncMediaRef,
    syncMediaIntervalRef,
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
