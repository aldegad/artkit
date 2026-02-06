import { User } from "firebase/auth";
import { SavedVideoProject } from "@/domains/video/types/project";
import {
  saveVideoProject,
  getVideoProject,
  getAllVideoProjects,
  deleteVideoProject,
} from "@/utils/videoStorage";
import {
  saveVideoProjectToFirebase,
  getVideoProjectFromFirebase,
  getAllVideoProjectsFromFirebase,
  deleteVideoProjectFromFirebase,
  hasCloudVideoProjects,
  deleteAllVideoProjectsFromFirebase,
  type SaveLoadProgress,
} from "@/lib/firebase/firebaseVideoStorage";
import { getStorageInfo } from "@/utils/storage";

// ============================================
// Storage Provider Interface
// ============================================

export interface VideoStorageInfo {
  used: number;
  quota: number;
  percentage: number;
}

export interface VideoStorageProvider {
  saveProject(
    project: SavedVideoProject,
    thumbnailDataUrl?: string,
    onProgress?: (progress: SaveLoadProgress) => void
  ): Promise<void>;
  getProject(
    id: string,
    onProgress?: (progress: SaveLoadProgress) => void
  ): Promise<SavedVideoProject | null>;
  getAllProjects(): Promise<SavedVideoProject[]>;
  deleteProject(id: string): Promise<void>;
  getStorageInfo(): Promise<VideoStorageInfo>;
  readonly type: "local" | "cloud";
}

// ============================================
// IndexedDB Storage Provider
// ============================================

class IndexedDBVideoStorageProvider implements VideoStorageProvider {
  readonly type = "local" as const;

  async saveProject(project: SavedVideoProject): Promise<void> {
    await saveVideoProject(project);
  }

  async getProject(id: string): Promise<SavedVideoProject | null> {
    const project = await getVideoProject(id);
    return project ?? null;
  }

  async getAllProjects(): Promise<SavedVideoProject[]> {
    return getAllVideoProjects();
  }

  async deleteProject(id: string): Promise<void> {
    await deleteVideoProject(id);
  }

  async getStorageInfo(): Promise<VideoStorageInfo> {
    return getStorageInfo();
  }
}

// ============================================
// Firebase Storage Provider
// ============================================

class FirebaseVideoStorageProvider implements VideoStorageProvider {
  readonly type = "cloud" as const;
  private userId: string;

  constructor(user: User) {
    this.userId = user.uid;
  }

  async saveProject(
    project: SavedVideoProject,
    thumbnailDataUrl?: string,
    onProgress?: (progress: SaveLoadProgress) => void
  ): Promise<void> {
    await saveVideoProjectToFirebase(this.userId, project, thumbnailDataUrl, onProgress);
  }

  async getProject(
    id: string,
    onProgress?: (progress: SaveLoadProgress) => void
  ): Promise<SavedVideoProject | null> {
    return getVideoProjectFromFirebase(this.userId, id, onProgress);
  }

  async getAllProjects(): Promise<SavedVideoProject[]> {
    return getAllVideoProjectsFromFirebase(this.userId);
  }

  async deleteProject(id: string): Promise<void> {
    await deleteVideoProjectFromFirebase(this.userId, id);
  }

  async getStorageInfo(): Promise<VideoStorageInfo> {
    return { used: 0, quota: 0, percentage: 0 };
  }
}

// ============================================
// Factory Function
// ============================================

export function getVideoStorageProvider(user: User | null): VideoStorageProvider {
  if (user) {
    return new FirebaseVideoStorageProvider(user);
  }
  return new IndexedDBVideoStorageProvider();
}

// ============================================
// Sync Utilities
// ============================================

export async function hasLocalVideoProjects(): Promise<boolean> {
  const projects = await getAllVideoProjects();
  return projects.length > 0;
}

export async function checkCloudVideoProjects(userId: string): Promise<boolean> {
  return hasCloudVideoProjects(userId);
}

export async function uploadLocalVideoProjectsToCloud(user: User): Promise<number> {
  const localProjects = await getAllVideoProjects();
  const provider = new FirebaseVideoStorageProvider(user);

  let uploaded = 0;
  for (const project of localProjects) {
    try {
      await provider.saveProject(project);
      uploaded++;
    } catch (error) {
      console.error(`Failed to upload video project ${project.id}:`, error);
    }
  }

  return uploaded;
}

export async function clearLocalVideoProjects(): Promise<void> {
  const projects = await getAllVideoProjects();
  for (const project of projects) {
    await deleteVideoProject(project.id);
  }
}

export async function clearCloudVideoProjects(user: User): Promise<void> {
  await deleteAllVideoProjectsFromFirebase(user.uid);
}
