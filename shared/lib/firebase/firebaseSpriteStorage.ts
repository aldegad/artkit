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
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  project: SavedSpriteProject
): Promise<void> {
  const docRef = doc(db, "users", userId, "spriteProjects", project.id);
  const existingSnap = await getDoc(docRef);
  const existingCreatedAt = existingSnap.exists()
    ? (existingSnap.data() as { createdAt?: Timestamp }).createdAt
    : undefined;
  const createdAt =
    existingCreatedAt && typeof existingCreatedAt.toMillis === "function"
      ? existingCreatedAt
      : Timestamp.fromMillis(project.savedAt || Date.now());

  let imageSrcRef: string | undefined;
  let inlineImageSrc: string | undefined;

  if (project.imageSrc) {
    if (project.imageSrc.startsWith("data:")) {
      imageSrcRef = await uploadDataUrl(
        `users/${userId}/sprite-media/${project.id}/source-image`,
        project.imageSrc
      );
    } else {
      inlineImageSrc = project.imageSrc;
    }
  }

  let thumbnailUrl: string | undefined;
  const firstFrameImage = project.tracks.flatMap((track) => track.frames).find((frame) => frame.imageData)?.imageData;
  if (firstFrameImage && firstFrameImage.startsWith("data:")) {
    try {
      thumbnailUrl = await uploadSpriteThumbnail(userId, project.id, firstFrameImage);
    } catch (error) {
      console.warn("Failed to upload sprite thumbnail:", error);
    }
  }

  const trackMetas: FirestoreSpriteTrackMeta[] = [];
  for (const track of project.tracks) {
    const frameMetas: FirestoreSpriteFrameMeta[] = [];
    for (const frame of track.frames) {
      let imageRef: string | undefined;
      let imageData: string | undefined;

      if (frame.imageData) {
        if (frame.imageData.startsWith("data:")) {
          imageRef = await uploadDataUrl(
            `users/${userId}/sprite-media/${project.id}/tracks/${track.id}/${frame.id}.png`,
            frame.imageData
          );
        } else {
          imageData = frame.imageData;
        }
      }

      frameMetas.push({
        id: frame.id,
        points: frame.points,
        name: frame.name,
        offset: frame.offset,
        disabled: frame.disabled,
        imageRef,
        imageData,
      });
    }

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
    createdAt,
    updatedAt: Timestamp.now(),
  };

  await setDoc(docRef, removeUndefined(firestoreProject));
}

export async function getSpriteProjectFromFirebase(
  userId: string,
  projectId: string
): Promise<SavedSpriteProject | null> {
  const docRef = doc(db, "users", userId, "spriteProjects", projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;

  const data = docSnap.data() as FirestoreSpriteProject;

  let imageSrc = data.imageSrc ?? "";
  if (data.imageSrcRef) {
    try {
      imageSrc = await downloadDataUrl(data.imageSrcRef);
    } catch (error) {
      console.error("Failed to download sprite source image:", error);
    }
  }

  const tracks: SpriteTrack[] = [];
  for (const trackMeta of data.tracks) {
    const frames: SpriteFrame[] = [];
    for (const frameMeta of trackMeta.frames) {
      let imageData = frameMeta.imageData;
      if (frameMeta.imageRef) {
        try {
          imageData = await downloadDataUrl(frameMeta.imageRef);
        } catch (error) {
          console.error(`Failed to download sprite frame ${frameMeta.id}:`, error);
        }
      }

      frames.push({
        id: frameMeta.id,
        points: frameMeta.points,
        name: frameMeta.name,
        offset: frameMeta.offset,
        disabled: frameMeta.disabled,
        imageData,
      });
    }

    tracks.push({
      id: trackMeta.id,
      name: trackMeta.name,
      frames,
      visible: trackMeta.visible,
      locked: trackMeta.locked,
      opacity: trackMeta.opacity,
      zIndex: trackMeta.zIndex,
      loop: trackMeta.loop,
    });
  }

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
