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
  uploadString,
  getBlob,
  deleteObject,
  listAll,
} from "firebase/storage";
import { db, storage } from "./config";
import { SavedImageProject, UnifiedLayer } from "@/types";

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
  storageRef: string; // Path to Storage file
}

interface FirestoreImageProject {
  id: string;
  name: string;
  canvasSize: { width: number; height: number };
  rotation: number;
  layers: FirestoreLayerMeta[];
  activeLayerId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  const path = `users/${userId}/layers/${projectId}/${layerId}.png`;
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
 * Delete all layer images for a project
 */
async function deleteProjectLayers(
  userId: string,
  projectId: string
): Promise<void> {
  const folderRef = ref(storage, `users/${userId}/layers/${projectId}`);

  try {
    const listResult = await listAll(folderRef);
    await Promise.all(
      listResult.items.map((itemRef) => deleteObject(itemRef))
    );
  } catch (error) {
    // Folder might not exist, ignore
    console.warn("Failed to delete project layers:", error);
  }
}

// ============================================
// Firestore Functions (Project Metadata)
// ============================================

/**
 * Save an image project to Firebase
 */
export async function saveProjectToFirebase(
  userId: string,
  project: SavedImageProject
): Promise<void> {
  // 1. Upload all layer images to Storage
  const layerMetas: FirestoreLayerMeta[] = [];

  if (project.unifiedLayers) {
    for (const layer of project.unifiedLayers) {
      let storageRef = "";

      if (layer.paintData) {
        storageRef = await uploadLayerImage(
          userId,
          project.id,
          layer.id,
          layer.paintData
        );
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

      layerMetas.push(layerMeta);
    }
  }

  // 2. Save metadata to Firestore
  const firestoreProject: FirestoreImageProject = {
    id: project.id,
    name: project.name || "Untitled",
    canvasSize: project.canvasSize || { width: 0, height: 0 },
    rotation: project.rotation ?? 0,
    layers: layerMetas,
    activeLayerId: project.activeLayerId ?? null,
    createdAt: Timestamp.fromMillis(project.savedAt || Date.now()),
    updatedAt: Timestamp.now(),
  };

  const docRef = doc(db, "users", userId, "imageProjects", project.id);
  await setDoc(docRef, firestoreProject);
}

/**
 * Get a single project from Firebase
 */
export async function getProjectFromFirebase(
  userId: string,
  projectId: string
): Promise<SavedImageProject | null> {
  const docRef = doc(db, "users", userId, "imageProjects", projectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data() as FirestoreImageProject;

  // Download layer images from Storage
  const unifiedLayers: UnifiedLayer[] = [];

  for (const layerMeta of data.layers) {
    let paintData = "";

    if (layerMeta.storageRef) {
      try {
        paintData = await downloadLayerImage(layerMeta.storageRef);
      } catch (error) {
        console.error(`Failed to download layer ${layerMeta.id}:`, error);
      }
    }

    unifiedLayers.push({
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
      paintData,
    });
  }

  return {
    id: data.id,
    name: data.name,
    canvasSize: data.canvasSize,
    rotation: data.rotation,
    unifiedLayers,
    activeLayerId: data.activeLayerId || undefined,
    savedAt: data.updatedAt.toMillis(),
  };
}

/**
 * Get all projects from Firebase (metadata only for list view)
 */
export async function getAllProjectsFromFirebase(
  userId: string
): Promise<SavedImageProject[]> {
  const collectionRef = collection(db, "users", userId, "imageProjects");
  const q = query(collectionRef, orderBy("updatedAt", "desc"));
  const querySnapshot = await getDocs(q);

  const projects: SavedImageProject[] = [];

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data() as FirestoreImageProject;

    // For list view, we don't need to download layer images
    // Just return metadata
    projects.push({
      id: data.id,
      name: data.name,
      canvasSize: data.canvasSize,
      rotation: data.rotation,
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
        paintData: "", // Don't load images for list
      })),
      activeLayerId: data.activeLayerId || undefined,
      savedAt: data.updatedAt.toMillis(),
    });
  }

  return projects;
}

/**
 * Delete a project from Firebase
 */
export async function deleteProjectFromFirebase(
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
export async function hasCloudProjects(userId: string): Promise<boolean> {
  const collectionRef = collection(db, "users", userId, "imageProjects");
  const querySnapshot = await getDocs(collectionRef);
  return !querySnapshot.empty;
}

/**
 * Delete all projects from Firebase
 */
export async function deleteAllProjectsFromFirebase(
  userId: string
): Promise<void> {
  const collectionRef = collection(db, "users", userId, "imageProjects");
  const querySnapshot = await getDocs(collectionRef);

  for (const docSnap of querySnapshot.docs) {
    await deleteProjectFromFirebase(userId, docSnap.id);
  }
}
