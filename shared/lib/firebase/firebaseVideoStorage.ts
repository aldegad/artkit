import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  uploadString,
  getBlob,
  getDownloadURL,
  deleteObject,
  listAll,
  type StorageReference,
} from "firebase/storage";
import { db, storage } from "./config";
import {
  SavedVideoProject,
  VideoProject,
  VideoTrack,
  MaskData,
  TimelineViewState,
} from "@/domains/video/types";
import { Clip } from "@/domains/video/types/clip";
import {
  loadMediaBlob,
} from "@/domains/video/utils/mediaStorage";

// ============================================
// Firestore Types
// ============================================

interface FirestoreClipMeta {
  id: string;
  name: string;
  type: "video" | "audio" | "image";
  trackId: string;
  startTime: number;
  duration: number;
  trimIn: number;
  trimOut: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  sourceId: string;
  sourceDuration?: number;
  sourceSize: { width: number; height: number };
  // Firebase storage reference for the media file
  storageRef: string;
  mediaType: string;
  // Audio properties
  hasAudio?: boolean;
  audioMuted?: boolean;
  audioVolume?: number;
  // Image inline data (for small images)
  imageData?: string;
}

interface FirestoreMaskMeta {
  id: string;
  trackId: string;
  startTime: number;
  duration: number;
  size: { width: number; height: number };
  maskDataRef?: string; // Storage path for mask image
}

interface FirestoreVideoProject {
  id: string;
  name: string;
  canvasSize: { width: number; height: number };
  frameRate: number;
  duration: number;
  tracks: VideoTrack[];
  clips: FirestoreClipMeta[];
  masks: FirestoreMaskMeta[];
  timelineView: TimelineViewState;
  currentTime: number;
  playbackRange?: {
    loop: boolean;
    loopStart: number;
    loopEnd: number;
  };
  thumbnailUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Utility: Remove undefined values (Firestore rejects undefined)
// ============================================

function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined) as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== undefined) {
      result[key] = removeUndefined(value);
    }
  }
  return result as T;
}

function readTimestampMillis(value: Timestamp | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const maybeTimestamp = value as { toMillis?: () => number } | undefined;
  if (maybeTimestamp && typeof maybeTimestamp.toMillis === "function") {
    return maybeTimestamp.toMillis();
  }
  return Date.now();
}

const VIDEO_LIST_PREFIX_CONCURRENCY = 4;
const VIDEO_LOAD_CLIP_CONCURRENCY = 4;
const VIDEO_LOAD_MASK_CONCURRENCY = 8;
const VIDEO_DELETE_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await mapper(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

// ============================================
// Progress Callback Type
// ============================================

export interface SaveLoadProgress {
  current: number;
  total: number;
  clipName: string;
}

// ============================================
// Storage Functions (Media Files)
// ============================================

/**
 * Upload a media blob to Firebase Storage
 */
async function uploadMediaFile(
  userId: string,
  projectId: string,
  clipId: string,
  blob: Blob,
  contentType: string
): Promise<string> {
  const ext = contentType.split("/")[1] || "bin";
  const path = `users/${userId}/video-media/${projectId}/${clipId}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, { contentType });

  return path;
}

/**
 * Download a media blob from Firebase Storage
 */
async function downloadMediaFile(path: string): Promise<Blob> {
  const storageRef = ref(storage, path);
  return getBlob(storageRef);
}

/**
 * Upload mask image to Firebase Storage
 */
async function uploadMaskImage(
  userId: string,
  projectId: string,
  maskId: string,
  base64Data: string
): Promise<string> {
  const path = `users/${userId}/video-media/${projectId}/masks/${maskId}/mask.png`;
  const storageRef = ref(storage, path);

  const base64Content = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;

  await uploadString(storageRef, base64Content, "base64", {
    contentType: "image/png",
  });

  return path;
}

/**
 * Download mask image from Firebase Storage
 */
async function downloadMaskImage(path: string): Promise<string> {
  const storageRef = ref(storage, path);
  const blob = await getBlob(storageRef);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload thumbnail and return public URL
 */
async function uploadVideoThumbnail(
  userId: string,
  projectId: string,
  base64Data: string
): Promise<string> {
  const path = `users/${userId}/video-media/${projectId}/thumbnail.png`;
  const storageRef = ref(storage, path);

  const base64Content = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;

  await uploadString(storageRef, base64Content, "base64", {
    contentType: "image/png",
  });

  return getDownloadURL(storageRef);
}

/**
 * List all media files for a project (recursive)
 */
async function listProjectMediaItems(
  userId: string,
  projectId: string
): Promise<StorageReference[]> {
  const folderRef = ref(storage, `users/${userId}/video-media/${projectId}`);

  const collect = async (folder: StorageReference): Promise<StorageReference[]> => {
    const listResult = await listAll(folder);
    const nested = await mapWithConcurrency(
      listResult.prefixes,
      VIDEO_LIST_PREFIX_CONCURRENCY,
      async (prefix) => collect(prefix)
    );
    return [...listResult.items, ...nested.flat()];
  };

  try {
    return await collect(folderRef);
  } catch {
    // Folder might not exist, ignore
    return [];
  }
}

// ============================================
// Helper: Convert Clip to Firestore Meta
// ============================================

function clipToMeta(clip: Clip, storageRef: string): FirestoreClipMeta {
  const meta: FirestoreClipMeta = {
    id: clip.id,
    name: clip.name,
    type: clip.type,
    trackId: clip.trackId,
    startTime: clip.startTime,
    duration: clip.duration,
    trimIn: clip.trimIn,
    trimOut: clip.trimOut,
    opacity: clip.opacity,
    visible: clip.visible,
    locked: clip.locked,
    position: clip.position,
    scale: clip.scale,
    rotation: clip.rotation,
    sourceId: clip.sourceId,
    sourceSize: clip.sourceSize,
    storageRef,
    mediaType: "",
  };

  if (clip.type === "video") {
    meta.sourceDuration = clip.sourceDuration;
    meta.hasAudio = clip.hasAudio;
    meta.audioMuted = clip.audioMuted;
    meta.audioVolume = clip.audioVolume;
  } else if (clip.type === "audio") {
    meta.sourceDuration = clip.sourceDuration;
    meta.audioMuted = clip.audioMuted;
    meta.audioVolume = clip.audioVolume;
  } else if (clip.type === "image") {
    meta.imageData = clip.imageData;
  }

  return meta;
}

function metaToClip(meta: FirestoreClipMeta, sourceUrl: string): Clip {
  const base = {
    id: meta.id,
    name: meta.name,
    trackId: meta.trackId,
    startTime: meta.startTime,
    duration: meta.duration,
    trimIn: meta.trimIn,
    trimOut: meta.trimOut,
    opacity: meta.opacity,
    visible: meta.visible,
    locked: meta.locked,
    position: meta.position,
    scale: meta.scale,
    rotation: meta.rotation,
    sourceId: meta.sourceId,
    sourceSize: meta.sourceSize,
    sourceUrl,
  };

  if (meta.type === "video") {
    return {
      ...base,
      type: "video",
      sourceDuration: meta.sourceDuration || meta.duration,
      hasAudio: meta.hasAudio ?? true,
      audioMuted: meta.audioMuted ?? false,
      audioVolume: meta.audioVolume ?? 100,
    };
  } else if (meta.type === "audio") {
    return {
      ...base,
      type: "audio",
      sourceDuration: meta.sourceDuration || meta.duration,
      audioMuted: meta.audioMuted ?? false,
      audioVolume: meta.audioVolume ?? 100,
    };
  } else {
    return {
      ...base,
      type: "image",
      imageData: meta.imageData,
    };
  }
}

// ============================================
// Firestore CRUD Functions
// ============================================

/**
 * Save a video project to Firebase
 */
export async function saveVideoProjectToFirebase(
  userId: string,
  project: SavedVideoProject,
  thumbnailDataUrl?: string,
  onProgress?: (progress: SaveLoadProgress) => void
): Promise<void> {
  const docRef = doc(db, "users", userId, "videoProjects", project.id);
  const existingSnap = await getDoc(docRef);
  const existingProject = existingSnap.exists()
    ? (existingSnap.data() as FirestoreVideoProject)
    : null;
  const existingCreatedAt = existingProject?.createdAt;
  const createdAt =
    existingCreatedAt && typeof existingCreatedAt.toMillis === "function"
      ? existingCreatedAt
      : Timestamp.fromMillis(project.savedAt || Date.now());
  const existingClipMap = new Map(
    (existingProject?.clips || []).map((clipMeta) => [clipMeta.id, clipMeta] as const)
  );

  const clips = project.project.clips;
  const masks = project.project.masks;
  const totalSteps = clips.length + (masks.length > 0 ? 1 : 0) + 1; // clips + masks + metadata
  let currentStep = 0;

  // 1. Upload media for each clip
  const clipMetas: FirestoreClipMeta[] = [];
  const clipIdsBySourceId = new Map<string, string[]>();
  const sourceBlobCache = new Map<string, Blob>();
  for (const clip of clips) {
    if (!clip.sourceId) continue;
    const ids = clipIdsBySourceId.get(clip.sourceId) || [];
    ids.push(clip.id);
    clipIdsBySourceId.set(clip.sourceId, ids);
  }

  for (const clip of clips) {
    onProgress?.({
      current: ++currentStep,
      total: totalSteps,
      clipName: clip.name,
    });

    let storageRefPath = "";
    let mediaBlob: Blob | null = null;
    let reusedMediaType = "";

    // Imported media is stored by clip.id in IndexedDB while clip.sourceUrl
    // stays as blob: URL for runtime playback.
    mediaBlob = await loadMediaBlob(clip.id);
    if (!mediaBlob && clip.sourceId) {
      mediaBlob = sourceBlobCache.get(clip.sourceId) || null;
      if (!mediaBlob) {
        const candidateIds = clipIdsBySourceId.get(clip.sourceId) || [];
        for (const candidateId of candidateIds) {
          if (candidateId === clip.id) continue;
          const candidateBlob = await loadMediaBlob(candidateId);
          if (candidateBlob) {
            mediaBlob = candidateBlob;
            sourceBlobCache.set(clip.sourceId, candidateBlob);
            break;
          }
        }
      }
    }
    if (mediaBlob && clip.sourceId && !sourceBlobCache.has(clip.sourceId)) {
      sourceBlobCache.set(clip.sourceId, mediaBlob);
    }

    if (mediaBlob) {
      storageRefPath = await uploadMediaFile(
        userId,
        project.id,
        clip.id,
        mediaBlob,
        mediaBlob.type || "application/octet-stream"
      );
    } else {
      const existingClipMeta = existingClipMap.get(clip.id);
      if (
        existingClipMeta?.storageRef &&
        existingClipMeta.sourceId === clip.sourceId
      ) {
        // If local blob is temporarily unavailable, keep existing uploaded media.
        storageRefPath = existingClipMeta.storageRef;
        reusedMediaType = existingClipMeta.mediaType || "";
      }
    }
    // If no media blob and no reusable reference are available, keep empty storageRef.
    // This preserves backward compatibility for non-uploadable clips.

    const meta = clipToMeta(clip, storageRefPath);
    meta.mediaType = mediaBlob?.type || reusedMediaType;
    clipMetas.push(meta);
  }

  // 2. Upload mask keyframes
  const maskMetas: FirestoreMaskMeta[] = [];

  if (masks.length > 0) {
    onProgress?.({
      current: ++currentStep,
      total: totalSteps,
      clipName: "Masks",
    });

    for (const mask of masks) {
      let maskDataRef: string | undefined;

      if (mask.maskData) {
        maskDataRef = await uploadMaskImage(
          userId,
          project.id,
          mask.id,
          mask.maskData
        );
      }

      maskMetas.push({
        id: mask.id,
        trackId: mask.trackId,
        startTime: mask.startTime,
        duration: mask.duration,
        size: mask.size,
        maskDataRef,
      });
    }
  }

  // 3. Upload thumbnail
  let thumbnailUrl: string | undefined = existingProject?.thumbnailUrl;
  if (thumbnailDataUrl) {
    try {
      thumbnailUrl = await uploadVideoThumbnail(userId, project.id, thumbnailDataUrl);
    } catch (error) {
      console.warn("Failed to upload video thumbnail:", error);
    }
  }

  // 4. Save metadata to Firestore
  onProgress?.({
    current: ++currentStep,
    total: totalSteps,
    clipName: "Saving metadata",
  });

  const firestoreProject: FirestoreVideoProject = {
    id: project.id,
    name: project.name || "Untitled Project",
    canvasSize: project.project.canvasSize,
    frameRate: project.project.frameRate,
    duration: project.project.duration,
    tracks: project.project.tracks,
    clips: clipMetas,
    masks: maskMetas,
    timelineView: project.timelineView,
    currentTime: project.currentTime,
    playbackRange: project.playbackRange,
    thumbnailUrl,
    createdAt,
    updatedAt: Timestamp.now(),
  };

  await setDoc(docRef, removeUndefined(firestoreProject));
}

/**
 * Get a single video project from Firebase (with media download)
 */
export async function getVideoProjectFromFirebase(
  userId: string,
  projectId: string,
  onProgress?: (progress: SaveLoadProgress) => void
): Promise<SavedVideoProject | null> {
  const docRef = doc(db, "users", userId, "videoProjects", projectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data() as FirestoreVideoProject;

  // Download media for each clip in parallel
  const totalSteps = data.clips.length + (data.masks.some((m) => m.maskDataRef) ? 1 : 0);
  let currentStep = 0;

  const clips: Clip[] = await mapWithConcurrency(
    data.clips,
    VIDEO_LOAD_CLIP_CONCURRENCY,
    async (clipMeta) => {
      onProgress?.({
        current: ++currentStep,
        total: totalSteps,
        clipName: clipMeta.name,
      });

      let sourceUrl = "";

      if (clipMeta.storageRef) {
        try {
          const blob = await downloadMediaFile(clipMeta.storageRef);

          // Store in local IndexedDB for autosave compatibility
          const { saveMediaBlob } = await import(
            "@/domains/video/utils/mediaStorage"
          );
          await saveMediaBlob(clipMeta.id, blob);
          sourceUrl = URL.createObjectURL(blob);
        } catch (error) {
          console.error(`Failed to download media for clip ${clipMeta.id}:`, error);
        }
      }

      return metaToClip(clipMeta, sourceUrl);
    }
  );

  // Download mask data
  const masks: MaskData[] = await mapWithConcurrency(
    data.masks,
    VIDEO_LOAD_MASK_CONCURRENCY,
    async (maskMeta) => {
      let maskData: string | null = null;

      if (maskMeta.maskDataRef) {
        onProgress?.({
          current: ++currentStep,
          total: totalSteps,
          clipName: "Masks",
        });

        try {
          maskData = await downloadMaskImage(maskMeta.maskDataRef);
        } catch (error) {
          console.error(`Failed to download mask ${maskMeta.id}:`, error);
        }
      }

      return {
        id: maskMeta.id,
        trackId: maskMeta.trackId,
        startTime: maskMeta.startTime,
        duration: maskMeta.duration,
        size: maskMeta.size,
        maskData,
      };
    }
  );

  const projectData: VideoProject = {
    id: data.id,
    name: data.name,
    canvasSize: data.canvasSize,
    frameRate: data.frameRate,
    duration: data.duration,
    tracks: data.tracks,
    clips,
    masks,
    assets: [],
  };

  return {
    id: data.id,
    name: data.name,
    project: projectData,
    timelineView: data.timelineView,
    currentTime: data.currentTime,
    playbackRange: data.playbackRange,
    savedAt: readTimestampMillis(data.updatedAt),
    thumbnailUrl: data.thumbnailUrl,
  };
}

/**
 * Get all video projects from Firebase (metadata only for list view)
 */
export async function getAllVideoProjectsFromFirebase(
  userId: string
): Promise<SavedVideoProject[]> {
  const collectionRef = collection(db, "users", userId, "videoProjects");
  const q = query(collectionRef, orderBy("updatedAt", "desc"));
  const querySnapshot = await getDocs(q);

  const projects: SavedVideoProject[] = [];

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data() as FirestoreVideoProject;

    projects.push({
      id: data.id,
      name: data.name,
      project: {
        id: data.id,
        name: data.name,
        canvasSize: data.canvasSize,
        frameRate: data.frameRate,
        duration: data.duration,
        tracks: data.tracks,
        clips: [], // Don't include clips in list view
        masks: [],
        assets: [],
      },
      timelineView: data.timelineView,
      currentTime: data.currentTime,
      playbackRange: data.playbackRange,
      savedAt: readTimestampMillis(data.updatedAt),
      thumbnailUrl: data.thumbnailUrl,
    });
  }

  return projects;
}

/**
 * Delete a video project from Firebase
 */
export async function deleteVideoProjectFromFirebase(
  userId: string,
  projectId: string,
  onProgress?: (progress: SaveLoadProgress) => void
): Promise<void> {
  const mediaItems = await listProjectMediaItems(userId, projectId);
  const totalSteps = mediaItems.length + 1; // media files + firestore metadata
  let currentStep = 0;

  await mapWithConcurrency(mediaItems, VIDEO_DELETE_CONCURRENCY, async (itemRef) => {
    onProgress?.({
      current: ++currentStep,
      total: totalSteps,
      clipName: itemRef.name || "Media",
    });
    await deleteObject(itemRef);
  });

  onProgress?.({
    current: ++currentStep,
    total: totalSteps,
    clipName: "Metadata",
  });

  const docRef = doc(db, "users", userId, "videoProjects", projectId);
  await deleteDoc(docRef);
}

/**
 * Check if user has any video projects in Firebase
 */
export async function hasCloudVideoProjects(userId: string): Promise<boolean> {
  const collectionRef = collection(db, "users", userId, "videoProjects");
  const querySnapshot = await getDocs(collectionRef);
  return !querySnapshot.empty;
}

/**
 * Delete all video projects from Firebase
 */
export async function deleteAllVideoProjectsFromFirebase(
  userId: string
): Promise<void> {
  const collectionRef = collection(db, "users", userId, "videoProjects");
  const querySnapshot = await getDocs(collectionRef);

  for (const docSnap of querySnapshot.docs) {
    await deleteVideoProjectFromFirebase(userId, docSnap.id);
  }
}
