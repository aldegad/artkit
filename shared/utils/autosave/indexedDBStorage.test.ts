// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDBStorage } from "./indexedDBStorage";
import type { BaseAutosaveData } from "./types";

interface TestAutosaveData extends BaseAutosaveData {
  projectName: string;
  layers: Array<{ id: string; paintData: string }>;
}

let dbCounter = 0;

function makeStorage() {
  dbCounter += 1;
  return createIndexedDBStorage<TestAutosaveData>({
    key: "editor-autosave-test",
    dbName: `autosave-test-db-${dbCounter}`,
  });
}

describe("createIndexedDBStorage (editor state autosave)", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    window.indexedDB = globalThis.indexedDB;
  });

  it("round-trips editor state with id/savedAt metadata", async () => {
    const storage = makeStorage();
    await storage.save({
      projectName: "My Project",
      layers: [{ id: "layer-1", paintData: "data:image/png;base64,AAAA" }],
    });

    const loaded = await storage.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.projectName).toBe("My Project");
    expect(loaded?.layers).toHaveLength(1);
    expect(loaded?.id).toBe("editor-autosave-test");
    expect(typeof loaded?.savedAt).toBe("number");
  });

  it("returns null when nothing was saved", async () => {
    const storage = makeStorage();
    await expect(storage.load()).resolves.toBeNull();
  });

  it("overwrites the previous autosave on subsequent saves", async () => {
    const storage = makeStorage();
    await storage.save({ projectName: "v1", layers: [] });
    await storage.save({ projectName: "v2", layers: [] });

    const loaded = await storage.load();
    expect(loaded?.projectName).toBe("v2");
  });

  it("clears the autosave", async () => {
    const storage = makeStorage();
    await storage.save({ projectName: "to-clear", layers: [] });
    await storage.clear();
    await expect(storage.load()).resolves.toBeNull();
  });

  it("propagates save failures instead of swallowing them (No Silent Fallback)", async () => {
    const storage = makeStorage();
    // Functions are not structured-cloneable → put() throws DataCloneError.
    const uncloneable = {
      projectName: "broken",
      layers: [],
      poison: () => undefined,
    } as unknown as Omit<TestAutosaveData, "savedAt" | "id">;

    await expect(storage.save(uncloneable)).rejects.toBeTruthy();

    // A failed save must not corrupt or block subsequent saves.
    await storage.save({ projectName: "recovered", layers: [] });
    const loaded = await storage.load();
    expect(loaded?.projectName).toBe("recovered");
  });
});
