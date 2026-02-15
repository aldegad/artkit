import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import {
  ref,
  uploadString,
  getBlob,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";
import { db, storage } from "./config";
import {
  removeUndefinedValues,
  readTimestampMillis,
} from "./firestoreValueUtils";
import { SavedImageProject, UnifiedLayer } from "@/domains/image/types";
import { generateThumbnailFromLayers } from "@/shared/utils/thumbnail";
import { normalizeProjectGroupName } from "@/shared/utils/projectGroups";

// ============================================
// Firestore Types
// ============================================

interface FirestoreLayerMeta {
  id: string;
  name: string;
  type: "paint";
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
  position?: { x: number; y: number };
  scale?: number;
  rotation?: number;
  originalSize?: { width: number; height: number };
  blendMode?: UnifiedLayer["blendMode"];
  storageRef: string; // Path to Storage file
  alphaMaskStorageRef?: string; // Optional path to layer alpha mask PNG
}

interface FirestoreImageProject {
  id: string;
  name: string;
  projectGroup?: string;
  canvasSize: { width: number; height: number };
  rotation: number;
  isPanLocked?: boolean;
  layers: FirestoreLayerMeta[];
  activeLayerId: string | null;
  thumbnailUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

function resolveProjectSavedAt(data: {
  updatedAt?: unknown;
  savedAt?: unknown;
  createdAt?: unknown;
}): number {
  return readTimestampMillis(data.updatedAt ?? data.savedAt ?? data.createdAt);
}

const IMAGE_LOAD_CONCURRENCY = 8;
const IMAGE_DELETE_CONCURRENCY = 8;

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
// Storage Functions (Layer Images)
// ============================================

/**
 * Upload a layer image (base64) to Firebase Storage
 */
async function uploadLayerImage(
  userId: string,
  projectId: string,
  layerId: string,
  base64Data: string
): Promise<string> {
  const path = `users/${userId}/image-media/${projectId}/${layerId}.png`;
  const storageRef = ref(storage, path);

  // Remove data URL prefix if present
  const base64Content = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;

  await uploadString(storageRef, base64Content, "base64", {
    contentType: "image/png",
  });

  return path;
}

/**
 * Upload a layer alpha mask image (base64) to Firebase Storage
 */
async function uploadLayerAlphaMask(
  userId: string,
  projectId: string,
  layerId: string,
  base64Data: string
): Promise<string> {
  const path = `users/${userId}/image-media/${projectId}/${layerId}.mask.png`;
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
 * Download a layer image from Firebase Storage
 */
async function downloadLayerImage(path: string): Promise<string> {
  const storageRef = ref(storage, path);

  // Use getBlob to avoid CORS issues
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
async function uploadThumbnail(
  userId: string,
  projectId: string,
  base64Data: string
): Promise<string> {
  const path = `users/${userId}/image-media/${projectId}/thumbnail.png`;
  const storageRef = ref(storage, path);

  const base64Content = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;

  await uploadString(storageRef, base64Content, "base64", {
    contentType: "image/png",
  });

  // Return public download URL
  return getDownloadURL(storageRef);
}

/**
 * Delete all layer images for a project
 */
async function deleteProjectLayers(
  userId: string,
  projectId: string
): Promise<void> {
  const folderRef = ref(storage, `users/${userId}/image-media/${projectId}`);

  try {
    const listResult = await listAll(folderRef);
    await mapWithConcurrency(listResult.items, IMAGE_DELETE_CONCURRENCY, async (itemRef) => {
      await deleteObject(itemRef);
    });
  } catch {
    // Folder might not exist, ignore
  }
}

// ============================================
// Firestore Functions (Project Metadata)
// ============================================

/**
 * Save an image project to Firebase
 */
export async function saveImageProjectToFirebase(
  userId: string,
  project: SavedImageProject
): Promise<void> {
  const docRef = doc(db, "users", userId, "imageProjects", project.id);
  const existingSnap = await getDoc(docRef);
  const existingProject = existingSnap.exists()
    ? (existingSnap.data() as FirestoreImageProject)
    : null;
  const existingCreatedAt = existingProject?.createdAt;
  const createdAt =
    existingCreatedAt && typeof existingCreatedAt.toMillis === "function"
      ? existingCreatedAt
      : Timestamp.fromMillis(project.savedAt || Date.now());
  const existingLayerMap = new Map(
    (existingProject?.layers || []).map((layerMeta) => [layerMeta.id, layerMeta] as const)
  );

  // 1. Upload all layer images to Storage
  const layerMetas: FirestoreLayerMeta[] = [];

  if (project.unifiedLayers) {
    for (const layer of project.unifiedLayers) {
      let storageRef = "";
      let alphaMaskStorageRef: string | undefined;

      if (layer.paintData) {
        storageRef = await uploadLayerImage(
          userId,
          project.id,
          layer.id,
          layer.paintData
        );
      } else {
        // Keep previous storage reference when layer bitmap is temporarily unavailable.
        storageRef = existingLayerMap.get(layer.id)?.storageRef || "";
      }

      if (layer.alphaMaskData) {
        alphaMaskStorageRef = await uploadLayerAlphaMask(
          userId,
          project.id,
          layer.id,
          layer.alphaMaskData
        );
      } else if (!layer.paintData) {
        // Preserve mask path only for metadata-only fallbacks.
        alphaMaskStorageRef = existingLayerMap.get(layer.id)?.alphaMaskStorageRef;
      }

      // Filter out undefined values (Firestore doesn't accept undefined)
      const layerMeta: FirestoreLayerMeta = {
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        zIndex: layer.zIndex,
        storageRef,
      };

      // Only add optional fields if they exist
      if (layer.position) layerMeta.position = layer.position;
      if (layer.scale !== undefined) layerMeta.scale = layer.scale;
      if (layer.rotation !== undefined) layerMeta.rotation = layer.rotation;
      if (layer.originalSize) layerMeta.originalSize = layer.originalSize;
      if (layer.blendMode) layerMeta.blendMode = layer.blendMode;
      if (alphaMaskStorageRef) layerMeta.alphaMaskStorageRef = alphaMaskStorageRef;

      layerMetas.push(layerMeta);
    }
  }

  // 2. Generate and upload optimized thumbnail (144x144, all layers merged)
  let thumbnailUrl: string | undefined = existingProject?.thumbnailUrl;
  if (project.unifiedLayers && project.unifiedLayers.length > 0 && project.canvasSize) {
    try {
      const thumbnailData = await generateThumbnailFromLayers(
        project.unifiedLayers,
        project.canvasSize
      );
      thumbnailUrl = await uploadThumbnail(userId, project.id, thumbnailData);
    } catch (error) {
      console.warn("Failed to generate/upload thumbnail:", error);
    }
  }

  // 3. Save metadata to Firestore
  const firestoreProject: FirestoreImageProject = {
    id: project.id,
    name: project.name || "Untitled",
    projectGroup: normalizeProjectGroupName(project.projectGroup),
    canvasSize: project.canvasSize || { width: 0, height: 0 },
    rotation: project.rotation ?? 0,
    isPanLocked: project.isPanLocked,
    layers: layerMetas,
    activeLayerId: project.activeLayerId ?? null,
    thumbnailUrl,
    createdAt,
    updatedAt: Timestamp.now(),
  };

  await setDoc(docRef, removeUndefinedValues(firestoreProject));
}

/**
 * Get a single project from Firebase
 */
export async function getImageProjectFromFirebase(
  userId: string,
  projectId: string
): Promise<SavedImageProject | null> {
  const docRef = doc(db, "users", userId, "imageProjects", projectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data() as FirestoreImageProject;

  // Download layer images from Storage (in parallel for better mobile performance)
  const unifiedLayers: UnifiedLayer[] = await mapWithConcurrency(
    data.layers,
    IMAGE_LOAD_CONCURRENCY,
    async (layerMeta) => {
      let paintData = "";

      if (layerMeta.storageRef) {
        try {
          paintData = await downloadLayerImage(layerMeta.storageRef);
        } catch (error) {
          console.error(`Failed to download layer ${layerMeta.id}:`, error);
        }
      }

      let alphaMaskData: string | undefined;
      if (layerMeta.alphaMaskStorageRef) {
        try {
          alphaMaskData = await downloadLayerImage(layerMeta.alphaMaskStorageRef);
        } catch (error) {
          console.error(`Failed to download layer mask ${layerMeta.id}:`, error);
        }
      }

      return {
        id: layerMeta.id,
        name: layerMeta.name,
        type: layerMeta.type,
        visible: layerMeta.visible,
        locked: layerMeta.locked,
        opacity: layerMeta.opacity,
        zIndex: layerMeta.zIndex,
        position: layerMeta.position,
        scale: layerMeta.scale,
        rotation: layerMeta.rotation,
        originalSize: layerMeta.originalSize,
        blendMode: layerMeta.blendMode,
        paintData,
        alphaMaskData,
      };
    }
  );

  return {
    id: data.id,
    name: data.name,
    projectGroup: normalizeProjectGroupName(data.projectGroup),
    canvasSize: data.canvasSize,
    rotation: data.rotation,
    isPanLocked: data.isPanLocked,
    unifiedLayers,
    activeLayerId: data.activeLayerId || undefined,
    savedAt: resolveProjectSavedAt(data),
  };
}

/**
 * Get all projects from Firebase (metadata only for list view)
 */
export async function getAllImageProjectsFromFirebase(
  userId: string
): Promise<SavedImageProject[]> {
  const collectionRef = collection(db, "users", userId, "imageProjects");
  const querySnapshot = await getDocs(collectionRef);

  const projects: SavedImageProject[] = [];

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data() as FirestoreImageProject;

    // For list view, we don't need to download layer images
    // Just return metadata with thumbnail URL
    projects.push({
      id: data.id,
      name: data.name,
      projectGroup: normalizeProjectGroupName(data.projectGroup),
      canvasSize: data.canvasSize,
      rotation: data.rotation,
      isPanLocked: data.isPanLocked,
      thumbnailUrl: data.thumbnailUrl,
      unifiedLayers: data.layers.map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        zIndex: l.zIndex,
        position: l.position,
        scale: l.scale,
        rotation: l.rotation,
        originalSize: l.originalSize,
        blendMode: l.blendMode,
        paintData: "", // Don't load images for list
        alphaMaskData: undefined,
      })),
      activeLayerId: data.activeLayerId || undefined,
      savedAt: resolveProjectSavedAt(data),
    });
  }

  projects.sort((a, b) => b.savedAt - a.savedAt);
  return projects;
}

/**
 * Delete a project from Firebase
 */
export async function deleteImageProjectFromFirebase(
  userId: string,
  projectId: string
): Promise<void> {
  // 1. Delete layer images from Storage
  await deleteProjectLayers(userId, projectId);

  // 2. Delete metadata from Firestore
  const docRef = doc(db, "users", userId, "imageProjects", projectId);
  await deleteDoc(docRef);
}

/**
 * Check if user has any projects in Firebase
 */
export async function hasCloudImageProjects(userId: string): Promise<boolean> {
  const collectionRef = collection(db, "users", userId, "imageProjects");
  const querySnapshot = await getDocs(collectionRef);
  return !querySnapshot.empty;
}

/**
 * Delete all projects from Firebase
 */
export async function deleteAllImageProjectsFromFirebase(
  userId: string
): Promise<void> {
  const collectionRef = collection(db, "users", userId, "imageProjects");
  const querySnapshot = await getDocs(collectionRef);

  for (const docSnap of querySnapshot.docs) {
    await deleteImageProjectFromFirebase(userId, docSnap.id);
  }
}
