import { User } from "firebase/auth";
import { SavedImageProject } from "@/types";
import {
  saveImageProject,
  getImageProject,
  getAllImageProjects,
  deleteImageProject,
  getStorageInfo,
} from "@/utils/storage";
import {
  saveProjectToFirebase,
  getProjectFromFirebase,
  getAllProjectsFromFirebase,
  deleteProjectFromFirebase,
  hasCloudProjects,
  deleteAllProjectsFromFirebase,
} from "@/lib/firebase/firebaseStorage";

// ============================================
// Storage Provider Interface
// ============================================

export interface StorageInfo {
  used: number;
  quota: number;
  percentage: number;
}

export interface StorageProvider {
  saveProject(project: SavedImageProject): Promise<void>;
  getProject(id: string): Promise<SavedImageProject | null>;
  getAllProjects(): Promise<SavedImageProject[]>;
  deleteProject(id: string): Promise<void>;
  getStorageInfo(): Promise<StorageInfo>;
  readonly type: "local" | "cloud";
}

// ============================================
// IndexedDB Storage Provider
// ============================================

class IndexedDBStorageProvider implements StorageProvider {
  readonly type = "local" as const;

  async saveProject(project: SavedImageProject): Promise<void> {
    await saveImageProject(project);
  }

  async getProject(id: string): Promise<SavedImageProject | null> {
    const project = await getImageProject(id);
    return project ?? null;
  }

  async getAllProjects(): Promise<SavedImageProject[]> {
    return getAllImageProjects();
  }

  async deleteProject(id: string): Promise<void> {
    await deleteImageProject(id);
  }

  async getStorageInfo(): Promise<StorageInfo> {
    return getStorageInfo();
  }
}

// ============================================
// Firebase Storage Provider
// ============================================

class FirebaseStorageProvider implements StorageProvider {
  readonly type = "cloud" as const;
  private userId: string;

  constructor(user: User) {
    this.userId = user.uid;
  }

  async saveProject(project: SavedImageProject): Promise<void> {
    await saveProjectToFirebase(this.userId, project);
  }

  async getProject(id: string): Promise<SavedImageProject | null> {
    return getProjectFromFirebase(this.userId, id);
  }

  async getAllProjects(): Promise<SavedImageProject[]> {
    return getAllProjectsFromFirebase(this.userId);
  }

  async deleteProject(id: string): Promise<void> {
    await deleteProjectFromFirebase(this.userId, id);
  }

  async getStorageInfo(): Promise<StorageInfo> {
    // Firebase doesn't have the same quota concept
    // Return a placeholder
    return { used: 0, quota: 0, percentage: 0 };
  }
}

// ============================================
// Factory Function
// ============================================

export function getStorageProvider(user: User | null): StorageProvider {
  if (user) {
    return new FirebaseStorageProvider(user);
  }
  return new IndexedDBStorageProvider();
}

// ============================================
// Sync Utilities
// ============================================

/**
 * Check if there are local projects in IndexedDB
 */
export async function hasLocalProjects(): Promise<boolean> {
  const projects = await getAllImageProjects();
  return projects.length > 0;
}

/**
 * Check if there are cloud projects for a user
 */
export async function checkCloudProjects(userId: string): Promise<boolean> {
  return hasCloudProjects(userId);
}

/**
 * Upload all local projects to Firebase
 */
export async function uploadLocalProjectsToCloud(user: User): Promise<number> {
  const localProjects = await getAllImageProjects();
  const provider = new FirebaseStorageProvider(user);

  let uploaded = 0;
  for (const project of localProjects) {
    try {
      await provider.saveProject(project);
      uploaded++;
    } catch (error) {
      console.error(`Failed to upload project ${project.id}:`, error);
    }
  }

  return uploaded;
}

/**
 * Clear all local projects from IndexedDB
 */
export async function clearLocalProjects(): Promise<void> {
  const projects = await getAllImageProjects();
  for (const project of projects) {
    await deleteImageProject(project.id);
  }
}

/**
 * Clear all cloud projects
 */
export async function clearCloudProjects(user: User): Promise<void> {
  await deleteAllProjectsFromFirebase(user.uid);
}

// Export provider class for type checking
export { IndexedDBStorageProvider, FirebaseStorageProvider };
