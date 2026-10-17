import { StorageError } from "./storage.js";

const COORDINATION_DATABASE = "nexus.write-coordination";
const STORE = "orders";
const UNAVAILABLE = "Safe saving is unavailable in this browser. Allow browser storage or try another browser.";

// IndexedDB stores revision/token metadata, never business records. It also fences stale LocalStorage caches.
export function createWriteCoordinator(
  storage,
  getIndexedDB = () => globalThis.indexedDB,
  createToken = () => globalThis.crypto.randomUUID(),
) {
  return (operation) =>
    new Promise((resolve, reject) => {
      let request;
      let settled = false;
      const fail = (error) => {
        settled = true;
        reject(error);
      };
      try {
        const indexedDB = getIndexedDB();
        if (!indexedDB) throw new Error("IndexedDB is unavailable.");
        request = indexedDB.open(COORDINATION_DATABASE, 1);
      } catch (cause) {
        fail(new StorageError(UNAVAILABLE, cause));
        return;
      }
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => fail(new StorageError(UNAVAILABLE, request.error));
      request.onblocked = () =>
        fail(new StorageError("Close other NEXUS tabs and try saving again. Your input has been kept."));
      request.onsuccess = () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        database.onversionchange = () => database.close();
        let transaction;
        let result;
        let operationError;
        try {
          transaction = database.transaction(STORE, "readwrite");
          transaction.oncomplete = () => {
            database.close();
            resolve(result);
          };
          transaction.onabort = () => {
            database.close();
            fail(operationError || new StorageError(UNAVAILABLE, transaction.error));
          };
          const store = transaction.objectStore(STORE);
          const lock = store.get("revision");
          lock.onsuccess = () => {
            try {
              const snapshot = storage.readSnapshot();
              const committed =
                lock.result === undefined
                  ? { revision: 0, token: null }
                  : typeof lock.result === "number"
                    ? { revision: lock.result, token: null }
                    : lock.result;
              if (
                !committed ||
                !Number.isSafeInteger(committed.revision) ||
                committed.revision < 0 ||
                (committed.token !== null &&
                  (typeof committed.token !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(committed.token)))
              )
                throw new StorageError("Saved workspace coordination is invalid. Your input has been kept.");
              if (
                snapshot.revision < committed.revision ||
                (snapshot.revision === committed.revision && snapshot.token !== committed.token)
              )
                throw new StorageError(
                  "Workspace data was updated in another tab. Close the dialog, refresh, and try again.",
                );
              // A higher local revision can recover a LocalStorage write whose transaction later failed.
              const revision = snapshot.revision + 1;
              if (!Number.isSafeInteger(revision)) throw new StorageError("The saved data revision limit was reached.");
              let token;
              try {
                token = createToken();
              } catch (cause) {
                throw new StorageError(UNAVAILABLE, cause);
              }
              if (typeof token !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(token))
                throw new StorageError(UNAVAILABLE);
              const reservation = store.put({ revision, token }, "revision");
              reservation.onsuccess = () => {
                try {
                  result = operation({
                    read: () => snapshot.data,
                    write: (data) => storage.write(data, revision, token),
                  });
                } catch (error) {
                  operationError = error;
                  transaction.abort();
                }
              };
            } catch (error) {
              operationError = error;
              transaction.abort();
            }
          };
        } catch (cause) {
          database.close();
          fail(new StorageError(UNAVAILABLE, cause));
        }
      };
    });
}
