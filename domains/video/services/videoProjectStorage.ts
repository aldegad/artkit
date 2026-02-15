import { User } from "firebase/auth";
import { SavedVideoProject } from "@/domains/video/types/project";
import {
  saveVideoProject,
  getVideoProject,
  getAllVideoProjects,
  deleteVideoProject,
} from "@/domains/video/utils/videoStorage";
import {
  saveVideoProjectToFirebase,
  getVideoProjectFromFirebase,
  getAllVideoProjectsFromFirebase,
  deleteVideoProjectFromFirebase,
  type SaveLoadProgress,
} from "@/shared/lib/firebase/firebaseVideoStorage";
import { getStorageInfo } from "@/shared/utils/storage";
import { normalizeProjectGroupName } from "@/shared/utils/projectGroups";

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
  deleteProject(
    id: string,
    onProgress?: (progress: SaveLoadProgress) => void
  ): Promise<void>;
  getStorageInfo(): Promise<VideoStorageInfo>;
  readonly type: "local" | "cloud";
}

// ============================================
// IndexedDB Storage Provider
// ============================================

class IndexedDBVideoStorageProvider implements VideoStorageProvider {
  readonly type = "local" as const;

  async saveProject(project: SavedVideoProject): Promise<void> {
    await saveVideoProject({
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    });
  }

  async getProject(id: string): Promise<SavedVideoProject | null> {
    const project = await getVideoProject(id);
    if (!project) return null;
    return {
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    };
  }

  async getAllProjects(): Promise<SavedVideoProject[]> {
    const projects = await getAllVideoProjects();
    return projects.map((project) => ({
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    }));
  }

  async deleteProject(
    id: string,
    onProgress?: (progress: SaveLoadProgress) => void
  ): Promise<void> {
    onProgress?.({ current: 1, total: 1, clipName: "Project" });
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
    await saveVideoProjectToFirebase(
      this.userId,
      {
        ...project,
        projectGroup: normalizeProjectGroupName(project.projectGroup),
      },
      thumbnailDataUrl,
      onProgress
    );
  }

  async getProject(
    id: string,
    onProgress?: (progress: SaveLoadProgress) => void
  ): Promise<SavedVideoProject | null> {
    const project = await getVideoProjectFromFirebase(this.userId, id, onProgress);
    if (!project) return null;
    return {
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    };
  }

  async getAllProjects(): Promise<SavedVideoProject[]> {
    const projects = await getAllVideoProjectsFromFirebase(this.userId);
    return projects.map((project) => ({
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    }));
  }

  async deleteProject(
    id: string,
    onProgress?: (progress: SaveLoadProgress) => void
  ): Promise<void> {
    await deleteVideoProjectFromFirebase(this.userId, id, onProgress);
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
