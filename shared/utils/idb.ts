// ============================================
// IndexedDB Connection Helper
// ============================================
//
// Shared plumbing for all IndexedDB-backed storage in the app.
// Fixes two failure modes the naive pattern has:
//
// 1. Stale cached connection: the browser can close an IDBDatabase at any
//    time (storage eviction, device sleep, another tab upgrading the
//    version). A connection cached forever then throws InvalidStateError on
//    every transaction until page reload. We listen to onclose /
//    onversionchange to drop the cache, and retry a failed operation once
//    on a fresh connection.
//
// 2. Premature success: QuotaExceededError often fires when the transaction
//    commits, *after* the individual request reported success. Resolving on
//    request.onsuccess reports "saved" for data that was never persisted.
//    We resolve only on transaction.oncomplete.

export interface IDBConnectionConfig {
  dbName: string;
  version: number;
  onUpgrade: (db: IDBDatabase) => void;
}

export interface IDBConnection {
  /**
   * Run a single-request operation against a store.
   * Resolves with the request result after the transaction commits.
   */
  withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest
  ): Promise<T>;
}

function isStaleConnectionError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "InvalidStateError";
}

export function createIDBConnection(config: IDBConnectionConfig): IDBConnection {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function open(invalidate: () => void): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available in this environment"));
        return;
      }

      const request = indexedDB.open(config.dbName, config.version);

      request.onerror = () => {
        reject(request.error ?? new Error(`Failed to open ${config.dbName}`));
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          invalidate();
        };
        db.onversionchange = () => {
          db.close();
          invalidate();
        };
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        config.onUpgrade((event.target as IDBOpenDBRequest).result);
      };
    });
  }

  function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
      const promise: Promise<IDBDatabase> = open(() => {
        if (dbPromise === promise) dbPromise = null;
      }).catch((error) => {
        if (dbPromise === promise) dbPromise = null;
        throw error;
      });
      dbPromise = promise;
    }
    return dbPromise;
  }

  async function runInStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest
  ): Promise<T> {
    const db = await getDB();

    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (error) {
        reject(error);
        return;
      }

      const request = run(transaction.objectStore(storeName));
      let result: T;

      request.onsuccess = () => {
        result = request.result as T;
      };
      transaction.oncomplete = () => {
        resolve(result);
      };
      transaction.onabort = () => {
        reject(
          transaction.error
            ?? request.error
            ?? new Error(`IndexedDB transaction aborted (${config.dbName}/${storeName})`)
        );
      };
    });
  }

  return {
    async withStore<T>(
      storeName: string,
      mode: IDBTransactionMode,
      run: (store: IDBObjectStore) => IDBRequest
    ): Promise<T> {
      try {
        return await runInStore<T>(storeName, mode, run);
      } catch (error) {
        if (!isStaleConnectionError(error)) throw error;
        dbPromise = null;
        return runInStore<T>(storeName, mode, run);
      }
    },
  };
}
