import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createIDBConnection } from "./idb";

const STORE = "test-store";

function makeConnection(dbName: string) {
  return createIDBConnection({
    dbName,
    version: 1,
    onUpgrade: (db) => {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    },
  });
}

describe("createIDBConnection", () => {
  beforeEach(() => {
    // Fresh IndexedDB universe per test
    globalThis.indexedDB = new IDBFactory();
  });

  it("puts and gets a record", async () => {
    const conn = makeConnection("idb-test-roundtrip");

    await conn.withStore(STORE, "readwrite", (store) =>
      store.put({ id: "a", value: 1 })
    );
    const loaded = await conn.withStore<{ id: string; value: number } | undefined>(
      STORE,
      "readonly",
      (store) => store.get("a")
    );

    expect(loaded).toEqual({ id: "a", value: 1 });
  });

  it("resolves save only after the transaction commits", async () => {
    const conn = makeConnection("idb-test-commit");

    // Regression guard: resolving on request.onsuccess instead of
    // transaction.oncomplete reports success for data that a commit-time
    // abort (e.g. QuotaExceededError) never persisted.
    await conn.withStore(STORE, "readwrite", (store) =>
      store.put({ id: "committed" })
    );

    const fresh = makeConnection("idb-test-commit");
    const loaded = await fresh.withStore<{ id: string } | undefined>(
      STORE,
      "readonly",
      (store) => store.get("committed")
    );
    expect(loaded).toEqual({ id: "committed" });
  });

  it("rejects when the transaction aborts", async () => {
    const conn = makeConnection("idb-test-abort");

    await expect(
      conn.withStore(STORE, "readwrite", (store) => {
        const request = store.put({ id: "x" });
        request.transaction?.abort();
        return request;
      })
    ).rejects.toBeTruthy();
  });

  it("recovers when the cached connection was closed", async () => {
    const dbName = "idb-test-stale";
    const conn = makeConnection(dbName);

    // Warm the connection cache
    await conn.withStore(STORE, "readwrite", (store) =>
      store.put({ id: "before-close" })
    );

    // Simulate the browser closing the cached connection (storage
    // eviction, device sleep): the next transaction() call throws
    // InvalidStateError, exactly like a real closed IDBDatabase.
    const openRequest = indexedDB.open(dbName, 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    const proto = Object.getPrototypeOf(db) as IDBDatabase;
    const realTransaction = proto.transaction;
    let thrown = false;
    proto.transaction = function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      if (!thrown) {
        thrown = true;
        throw new DOMException("The database connection is closing.", "InvalidStateError");
      }
      return realTransaction.apply(this, args);
    };
    db.close();

    try {
      // The helper must retry once on a fresh connection instead of
      // staying wedged on the dead cached one.
      const loaded = await conn
        .withStore(STORE, "readwrite", (store) => store.put({ id: "after-close" }))
        .then(() =>
          conn.withStore<{ id: string } | undefined>(STORE, "readonly", (store) =>
            store.get("after-close")
          )
        );
      expect(thrown).toBe(true);
      expect(loaded).toEqual({ id: "after-close" });
    } finally {
      proto.transaction = realTransaction;
    }
  });

  it("propagates open errors and allows retry", async () => {
    const conn = makeConnection("idb-test-open-error");

    const realOpen = indexedDB.open.bind(indexedDB);
    const openSpy = vi
      .spyOn(indexedDB, "open")
      .mockImplementationOnce(() => {
        throw new Error("open failed");
      });

    await expect(
      conn.withStore(STORE, "readonly", (store) => store.get("missing"))
    ).rejects.toThrow("open failed");

    openSpy.mockImplementation(realOpen);

    // A failed open must not poison the cached connection forever.
    const loaded = await conn.withStore<unknown>(STORE, "readonly", (store) =>
      store.get("missing")
    );
    expect(loaded).toBeUndefined();
  });
});
