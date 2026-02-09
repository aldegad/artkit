import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import {
  deleteObject,
  getBlob,
  getDownloadURL,
  listAll,
  ref,
  type StorageReference,
  uploadString,
} from "firebase/storage";
import type { SavedSpriteProject, SpriteFrame, SpriteTrack } from "@/domains/sprite/types";
import { db, storage } from "./config";

interface FirestoreSpriteFrameMeta {
  id: number;
  points: SpriteFrame["points"];
  name: string;
  offset: SpriteFrame["offset"];
  disabled?: boolean;
  imageRef?: string;
  imageData?: string;
  imageFingerprint?: string;
}

interface FirestoreSpriteTrackMeta {
  id: string;
  name: string;
  frames: FirestoreSpriteFrameMeta[];
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
  loop: boolean;
}

interface FirestoreSpriteProject {
  id: string;
  name: string;
  imageSrcRef?: string;
  imageSrc?: string;
  imageSize: SavedSpriteProject["imageSize"];
  tracks: FirestoreSpriteTrackMeta[];
  nextFrameId: number;
  fps: number;
  viewState?: SavedSpriteProject["viewState"];
  thumbnailUrl?: string;
  imageSrcFingerprint?: string;
  thumbnailFingerprint?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SpriteSaveLoadProgress {
  phase: "save" | "load";
  current: number;
  total: number;
  itemName: string;
}

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

async function uploadDataUrl(path: string, dataUrl: string): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadString(storageRef, dataUrl, "data_url");
  return path;
}

function buildLegacyDataFingerprint(dataUrl: string): string {
  const len = dataUrl.length;
  const head = dataUrl.slice(0, 64);
  const middleStart = Math.max(0, Math.floor(len / 2) - 32);
  const middle = dataUrl.slice(middleStart, middleStart + 64);
  const tail = dataUrl.slice(-64);
  return `${len}:${head}:${middle}:${tail}`;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function getHashBytesFromDataUrl(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx <= 0 || commaIdx >= dataUrl.length - 1) {
    return new TextEncoder().encode(dataUrl);
  }

  const header = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  const isBase64 = /;base64/i.test(header);

  if (!isBase64 || typeof atob === "undefined") {
    return new TextEncoder().encode(payload);
  }

  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new TextEncoder().encode(dataUrl);
  }
}

async function buildDataFingerprint(dataUrl: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle === "undefined") {
    // Fallback for non-WebCrypto environments.
    return `legacy:${buildLegacyDataFingerprint(dataUrl)}`;
  }

  const bytes = getHashBytesFromDataUrl(dataUrl);
  const normalizedBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(normalizedBuffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", normalizedBuffer);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

function isSameDataFingerprint(
  existingFingerprint: string | undefined,
  nextFingerprint: string,
  legacyFingerprint: string
): boolean {
  if (!existingFingerprint) return false;
  return (
    existingFingerprint === nextFingerprint ||
    existingFingerprint === legacyFingerprint ||
    existingFingerprint === `legacy:${legacyFingerprint}`
  );
}

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

async function downloadDataUrl(path: string): Promise<string> {
  const storageRef = ref(storage, path);
  const blob = await getBlob(storageRef);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadSpriteThumbnail(
  userId: string,
  projectId: string,
  thumbnailDataUrl: string
): Promise<string> {
  const path = `users/${userId}/sprite-media/${projectId}/thumbnail.png`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, thumbnailDataUrl, "data_url");
  return getDownloadURL(storageRef);
}

async function deleteFolderRecursive(folderRef: StorageReference): Promise<void> {
  const listResult = await listAll(folderRef);
  await Promise.all(listResult.items.map((itemRef) => deleteObject(itemRef)));
  await Promise.all(listResult.prefixes.map((prefixRef) => deleteFolderRecursive(prefixRef)));
}

async function deleteProjectMedia(userId: string, projectId: string): Promise<void> {
  const folderRef = ref(storage, `users/${userId}/sprite-media/${projectId}`);
  try {
    await deleteFolderRecursive(folderRef);
  } catch {
    // Folder might not exist
  }
}

export async function saveSpriteProjectToFirebase(
  userId: string,
  project: SavedSpriteProject,
  onProgress?: (progress: SpriteSaveLoadProgress) => void
): Promise<void> {
  const docRef = doc(db, "users", userId, "spriteProjects", project.id);
  const existingSnap = await getDoc(docRef);
  const existingData = existingSnap.exists() ? (existingSnap.data() as FirestoreSpriteProject) : null;
  const existingCreatedAt = existingSnap.exists()
    ? (existingSnap.data() as { createdAt?: Timestamp }).createdAt
    : undefined;
  const createdAt =
    existingCreatedAt && typeof existingCreatedAt.toMillis === "function"
      ? existingCreatedAt
      : Timestamp.fromMillis(project.savedAt || Date.now());

  const dataUrlFrameCount = project.tracks.reduce((count, track) => {
    return count + track.frames.filter((frame) => frame.imageData?.startsWith("data:")).length;
  }, 0);
  const hasDataUrlSourceImage = Boolean(project.imageSrc && project.imageSrc.startsWith("data:"));
  const firstFrameImage = project.tracks.flatMap((track) => track.frames).find((frame) => frame.imageData)?.imageData;
  const hasDataUrlThumbnail = Boolean(firstFrameImage && firstFrameImage.startsWith("data:"));
  const totalSteps = dataUrlFrameCount + (hasDataUrlSourceImage ? 1 : 0) + (hasDataUrlThumbnail ? 1 : 0) + 1;
  let currentStep = 0;

  const existingFrameMetaMap = new Map<string, FirestoreSpriteFrameMeta>();
  if (existingData) {
    for (const trackMeta of existingData.tracks) {
      for (const frameMeta of trackMeta.frames) {
        existingFrameMetaMap.set(`${trackMeta.id}:${frameMeta.id}`, frameMeta);
      }
    }
  }

  let imageSrcRef: string | undefined;
  let inlineImageSrc: string | undefined;
  let imageSrcFingerprint: string | undefined;

  if (project.imageSrc) {
    if (project.imageSrc.startsWith("data:")) {
      const fingerprint = await buildDataFingerprint(project.imageSrc);
      const legacyFingerprint = buildLegacyDataFingerprint(project.imageSrc);
      imageSrcFingerprint = fingerprint;
      onProgress?.({
        phase: "save",
        current: ++currentStep,
        total: totalSteps,
        itemName: "Source image",
      });

      if (
        existingData?.imageSrcRef &&
        isSameDataFingerprint(existingData.imageSrcFingerprint, fingerprint, legacyFingerprint)
      ) {
        imageSrcRef = existingData.imageSrcRef;
      } else {
        imageSrcRef = await uploadDataUrl(
          `users/${userId}/sprite-media/${project.id}/source-image`,
          project.imageSrc
        );
      }
    } else {
      inlineImageSrc = project.imageSrc;
    }
  }

  let thumbnailUrl: string | undefined;
  let thumbnailFingerprint: string | undefined;
  if (firstFrameImage && firstFrameImage.startsWith("data:")) {
    thumbnailFingerprint = await buildDataFingerprint(firstFrameImage);
    const thumbnailLegacyFingerprint = buildLegacyDataFingerprint(firstFrameImage);
    onProgress?.({
      phase: "save",
      current: ++currentStep,
      total: totalSteps,
      itemName: "Thumbnail",
    });
    try {
      if (
        existingData?.thumbnailUrl &&
        isSameDataFingerprint(
          existingData.thumbnailFingerprint,
          thumbnailFingerprint,
          thumbnailLegacyFingerprint
        )
      ) {
        thumbnailUrl = existingData.thumbnailUrl;
      } else {
        thumbnailUrl = await uploadSpriteThumbnail(userId, project.id, firstFrameImage);
      }
    } catch (error) {
      console.warn("Failed to upload sprite thumbnail:", error);
      thumbnailUrl = existingData?.thumbnailUrl;
    }
  } else {
    thumbnailUrl = existingData?.thumbnailUrl;
  }

  const trackMetas: FirestoreSpriteTrackMeta[] = [];
  for (const track of project.tracks) {
    const frameMetas = await mapWithConcurrency(track.frames, 4, async (frame) => {
      let imageRef: string | undefined;
      let imageData: string | undefined;
      let imageFingerprint: string | undefined;

      if (frame.imageData) {
        if (frame.imageData.startsWith("data:")) {
          imageFingerprint = await buildDataFingerprint(frame.imageData);
          const legacyFingerprint = buildLegacyDataFingerprint(frame.imageData);
          onProgress?.({
            phase: "save",
            current: ++currentStep,
            total: totalSteps,
            itemName: `${track.name} / ${frame.name || frame.id}`,
          });
          const existingMeta = existingFrameMetaMap.get(`${track.id}:${frame.id}`);
          if (
            existingMeta?.imageRef &&
            isSameDataFingerprint(existingMeta.imageFingerprint, imageFingerprint, legacyFingerprint)
          ) {
            imageRef = existingMeta.imageRef;
          } else {
            imageRef = await uploadDataUrl(
              `users/${userId}/sprite-media/${project.id}/tracks/${track.id}/${frame.id}.png`,
              frame.imageData
            );
          }
        } else {
          imageData = frame.imageData;
        }
      }

      return {
        id: frame.id,
        points: frame.points,
        name: frame.name,
        offset: frame.offset,
        disabled: frame.disabled,
        imageRef,
        imageData,
        imageFingerprint,
      };
    });

    trackMetas.push({
      id: track.id,
      name: track.name,
      frames: frameMetas,
      visible: track.visible,
      locked: track.locked,
      opacity: track.opacity,
      zIndex: track.zIndex,
      loop: track.loop,
    });
  }

  const firestoreProject: FirestoreSpriteProject = {
    id: project.id,
    name: project.name || "Untitled Project",
    imageSrcRef,
    imageSrc: inlineImageSrc,
    imageSize: project.imageSize,
    tracks: trackMetas,
    nextFrameId: project.nextFrameId,
    fps: project.fps,
    viewState: project.viewState,
    thumbnailUrl,
    imageSrcFingerprint,
    thumbnailFingerprint,
    createdAt,
    updatedAt: Timestamp.now(),
  };

  onProgress?.({
    phase: "save",
    current: ++currentStep,
    total: totalSteps,
    itemName: "Saving metadata",
  });
  await setDoc(docRef, removeUndefined(firestoreProject));
}

export async function getSpriteProjectFromFirebase(
  userId: string,
  projectId: string,
  onProgress?: (progress: SpriteSaveLoadProgress) => void
): Promise<SavedSpriteProject | null> {
  const docRef = doc(db, "users", userId, "spriteProjects", projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;

  const data = docSnap.data() as FirestoreSpriteProject;
  const imageRefFrameCount = data.tracks.reduce((count, trackMeta) => {
    return count + trackMeta.frames.filter((frameMeta) => Boolean(frameMeta.imageRef)).length;
  }, 0);
  const totalSteps = imageRefFrameCount + (data.imageSrcRef ? 1 : 0);
  let currentStep = 0;

  let imageSrc = data.imageSrc ?? "";
  if (data.imageSrcRef) {
    try {
      onProgress?.({
        phase: "load",
        current: ++currentStep,
        total: totalSteps,
        itemName: "Source image",
      });
      imageSrc = await downloadDataUrl(data.imageSrcRef);
    } catch (error) {
      console.error("Failed to download sprite source image:", error);
    }
  }

  const tracks: SpriteTrack[] = await Promise.all(
    data.tracks.map(async (trackMeta) => {
      const frames: SpriteFrame[] = await Promise.all(
        trackMeta.frames.map(async (frameMeta) => {
          let imageData = frameMeta.imageData;
          if (frameMeta.imageRef) {
            try {
              onProgress?.({
                phase: "load",
                current: ++currentStep,
                total: totalSteps,
                itemName: `${trackMeta.name} / ${frameMeta.name || frameMeta.id}`,
              });
              imageData = await downloadDataUrl(frameMeta.imageRef);
            } catch (error) {
              console.error(`Failed to download sprite frame ${frameMeta.id}:`, error);
            }
          }

          return {
            id: frameMeta.id,
            points: frameMeta.points,
            name: frameMeta.name,
            offset: frameMeta.offset,
            disabled: frameMeta.disabled,
            imageData,
          };
        }),
      );

      return {
        id: trackMeta.id,
        name: trackMeta.name,
        frames,
        visible: trackMeta.visible,
        locked: trackMeta.locked,
        opacity: trackMeta.opacity,
        zIndex: trackMeta.zIndex,
        loop: trackMeta.loop,
      };
    }),
  );

  return {
    id: data.id,
    name: data.name,
    imageSrc,
    imageSize: data.imageSize,
    tracks,
    nextFrameId: data.nextFrameId,
    fps: data.fps,
    viewState: data.viewState,
    savedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
    thumbnailUrl: data.thumbnailUrl,
  };
}

export async function getAllSpriteProjectsFromFirebase(
  userId: string
): Promise<SavedSpriteProject[]> {
  const collectionRef = collection(db, "users", userId, "spriteProjects");
  const q = query(collectionRef, orderBy("updatedAt", "desc"));
  const querySnapshot = await getDocs(q);

  const projects: SavedSpriteProject[] = [];

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data() as FirestoreSpriteProject;
    projects.push({
      id: data.id,
      name: data.name,
      imageSrc: "",
      imageSize: data.imageSize,
      tracks: data.tracks.map((trackMeta) => ({
        id: trackMeta.id,
        name: trackMeta.name,
        frames: trackMeta.frames.map((frameMeta) => ({
          id: frameMeta.id,
          points: frameMeta.points,
          name: frameMeta.name,
          offset: frameMeta.offset,
          disabled: frameMeta.disabled,
        })),
        visible: trackMeta.visible,
        locked: trackMeta.locked,
        opacity: trackMeta.opacity,
        zIndex: trackMeta.zIndex,
        loop: trackMeta.loop,
      })),
      nextFrameId: data.nextFrameId,
      fps: data.fps,
      viewState: data.viewState,
      savedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
      thumbnailUrl: data.thumbnailUrl,
    });
  }

  return projects;
}

export async function deleteSpriteProjectFromFirebase(
  userId: string,
  projectId: string
): Promise<void> {
  await deleteProjectMedia(userId, projectId);
  const docRef = doc(db, "users", userId, "spriteProjects", projectId);
  await deleteDoc(docRef);
}

export async function hasCloudSpriteProjects(userId: string): Promise<boolean> {
  const collectionRef = collection(db, "users", userId, "spriteProjects");
  const querySnapshot = await getDocs(collectionRef);
  return !querySnapshot.empty;
}

export async function deleteAllSpriteProjectsFromFirebase(
  userId: string
): Promise<void> {
  const collectionRef = collection(db, "users", userId, "spriteProjects");
  const querySnapshot = await getDocs(collectionRef);
  for (const docSnap of querySnapshot.docs) {
    await deleteSpriteProjectFromFirebase(userId, docSnap.id);
  }
}
