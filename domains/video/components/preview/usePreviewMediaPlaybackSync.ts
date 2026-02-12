"use client";

import { useCallback, useEffect, MutableRefObject, RefObject } from "react";
import { PLAYBACK } from "../../constants";
import { AudioClip, Clip, PlaybackState, VideoClip, VideoTrack } from "../../types";
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
    const videoClips = clips.filter((clip): clip is VideoClip => clip.type === "video");
    const audioClips = clips.filter((clip): clip is AudioClip => clip.type === "audio");

    if (!playback.isPlaying) {
      forceStopMediaImmediately();
      wasPlayingRef.current = false;
      return;
    }

    // Sync and start/stop media elements
    const syncMedia = () => {
      const ct = currentTimeRef.current || 0;
      const trackById = new Map(tracks.map((track) => [track.id, track]));

      // Collect audible clips at current time
      const audibleClipIds = new Set<string>();
      for (const track of tracks) {
        if (!track.visible || track.muted) continue;
        const clip = getClipAtTime(track.id, ct);
        if (!clip || !clip.visible) continue;
        if (isAudibleMediaClip(clip)) {
          audibleClipIds.add(clip.id);
        }
      }

      for (const clip of videoClips) {
        const video = videoElementsRef.current?.get(clip.id);
        const track = trackById.get(clip.trackId);
        if (!video || !track || video.readyState < 2) continue;

        const clipTime = ct - clip.startTime;
        if (clipTime < 0 || clipTime >= clip.duration || !clip.visible || !track.visible) {
          video.pause();
          video.muted = true;
          continue;
        }

        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(video.currentTime - sourceTime) > PLAYBACK.SEEK_DRIFT_THRESHOLD) {
          video.currentTime = sourceTime;
        }

        video.playbackRate = playback.playbackRate;

        // Web Audio handles audio when buffer is ready — mute HTMLVideoElement
        if (isWebAudioReadyRef.current(clip.sourceUrl)) {
          video.muted = true;
          video.volume = 0;
        } else {
          // Fallback: HTMLMediaElement audio (draft mode)
          const isAudible = audibleClipIds.has(clip.id);
          video.muted = !isAudible;
          const clipVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
          video.volume = isAudible ? Math.max(0, Math.min(1, clipVolume / 100)) : 0;
        }

        if (video.paused) video.play().catch(() => {});
      }

      for (const clip of audioClips) {
        const audio = audioElementsRef.current?.get(clip.id);
        const track = trackById.get(clip.trackId);
        if (!audio || !track) continue;

        // Web Audio handles this clip — skip HTMLAudioElement entirely
        if (isWebAudioReadyRef.current(clip.sourceUrl)) {
          audio.pause();
          audio.muted = true;
          continue;
        }

        // Fallback: HTMLMediaElement audio (draft mode)
        const clipTime = ct - clip.startTime;
        if (clipTime < 0 || clipTime >= clip.duration || !clip.visible || !track.visible || !audibleClipIds.has(clip.id)) {
          audio.pause();
          audio.muted = true;
          continue;
        }

        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(audio.currentTime - sourceTime) > PLAYBACK.AUDIO_SEEK_DRIFT_THRESHOLD) {
          audio.currentTime = sourceTime;
        }

        audio.playbackRate = playback.playbackRate;
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
    clips,
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
