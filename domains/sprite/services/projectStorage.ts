import { User } from "firebase/auth";
import type { SavedSpriteProject } from "@/domains/sprite/types";
import {
  clearAllProjects,
  deleteProject,
  getAllProjects,
  getProject,
  getStorageInfo,
  saveProject,
} from "@/shared/utils/storage";
import {
  deleteAllSpriteProjectsFromFirebase,
  deleteSpriteProjectFromFirebase,
  getAllSpriteProjectsFromFirebase,
  getSpriteProjectFromFirebase,
  hasCloudSpriteProjects,
  saveSpriteProjectToFirebase,
  type SpriteSaveLoadProgress,
} from "@/shared/lib/firebase/firebaseSpriteStorage";
import { normalizeProjectGroupName } from "@/shared/utils/projectGroups";

export interface SpriteStorageInfo {
  used: number;
  quota: number;
  percentage: number;
}

export interface SpriteStorageProvider {
  saveProject(
    project: SavedSpriteProject,
    onProgress?: (progress: SpriteSaveLoadProgress) => void
  ): Promise<void>;
  getProject(
    id: string,
    onProgress?: (progress: SpriteSaveLoadProgress) => void
  ): Promise<SavedSpriteProject | null>;
  getAllProjects(): Promise<SavedSpriteProject[]>;
  deleteProject(id: string): Promise<void>;
  getStorageInfo(): Promise<SpriteStorageInfo>;
  readonly type: "local" | "cloud";
}

class IndexedDBSpriteStorageProvider implements SpriteStorageProvider {
  readonly type = "local" as const;

  async saveProject(
    project: SavedSpriteProject,
    onProgress?: (progress: SpriteSaveLoadProgress) => void
  ): Promise<void> {
    onProgress?.({ phase: "save", current: 1, total: 1, itemName: "Saving local project" });
    await saveProject({
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    });
  }

  async getProject(
    id: string,
    onProgress?: (progress: SpriteSaveLoadProgress) => void
  ): Promise<SavedSpriteProject | null> {
    onProgress?.({ phase: "load", current: 1, total: 1, itemName: "Loading local project" });
    const project = await getProject(id);
    if (!project) return null;
    return {
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    };
  }

  async getAllProjects(): Promise<SavedSpriteProject[]> {
    const projects = await getAllProjects();
    return projects.map((project) => ({
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    }));
  }

  async deleteProject(id: string): Promise<void> {
    await deleteProject(id);
  }

  async getStorageInfo(): Promise<SpriteStorageInfo> {
    return getStorageInfo();
  }
}

class FirebaseSpriteStorageProvider implements SpriteStorageProvider {
  readonly type = "cloud" as const;
  private userId: string;

  constructor(user: User) {
    this.userId = user.uid;
  }

  async saveProject(
    project: SavedSpriteProject,
    onProgress?: (progress: SpriteSaveLoadProgress) => void
  ): Promise<void> {
    await saveSpriteProjectToFirebase(this.userId, {
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    }, onProgress);
  }

  async getProject(
    id: string,
    onProgress?: (progress: SpriteSaveLoadProgress) => void
  ): Promise<SavedSpriteProject | null> {
    const project = await getSpriteProjectFromFirebase(this.userId, id, onProgress);
    if (!project) return null;
    return {
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    };
  }

  async getAllProjects(): Promise<SavedSpriteProject[]> {
    const projects = await getAllSpriteProjectsFromFirebase(this.userId);
    return projects.map((project) => ({
      ...project,
      projectGroup: normalizeProjectGroupName(project.projectGroup),
    }));
  }

  async deleteProject(id: string): Promise<void> {
    await deleteSpriteProjectFromFirebase(this.userId, id);
  }

  async getStorageInfo(): Promise<SpriteStorageInfo> {
    return { used: 0, quota: 0, percentage: 0 };
  }
}

export function getSpriteStorageProvider(user: User | null): SpriteStorageProvider {
  if (user) {
    return new FirebaseSpriteStorageProvider(user);
  }
  return new IndexedDBSpriteStorageProvider();
}

export async function hasLocalProjects(): Promise<boolean> {
  const projects = await getAllProjects();
  return projects.length > 0;
}

export async function checkCloudProjects(userId: string): Promise<boolean> {
  return hasCloudSpriteProjects(userId);
}

export async function uploadLocalProjectsToCloud(user: User): Promise<number> {
  const localProjects = await getAllProjects();
  const provider = new FirebaseSpriteStorageProvider(user);

  let uploaded = 0;
  for (const project of localProjects) {
    try {
      await provider.saveProject(project);
      uploaded++;
    } catch (error) {
      console.error(`Failed to upload sprite project ${project.id}:`, error);
    }
  }

  return uploaded;
}

export async function clearLocalProjects(): Promise<void> {
  await clearAllProjects();
}

export async function clearCloudProjects(user: User): Promise<void> {
  await deleteAllSpriteProjectsFromFirebase(user.uid);
}

export { IndexedDBSpriteStorageProvider, FirebaseSpriteStorageProvider };
