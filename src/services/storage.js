import { validateDatabase } from "../domain/integrity.js";
import { createSeed } from "./seed.js";

export const DATABASE_KEY = "nexus.database";
export const SCHEMA_VERSION = 1;

export class StorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "StorageError";
  }
}

export function createDatabaseStorage(storage, seed = createSeed) {
  return {
    read() {
      return this.readSnapshot().data;
    },
    readSnapshot() {
      let raw;
      try {
        raw = storage.getItem(DATABASE_KEY);
      } catch (cause) {
        throw new StorageError("Browser storage is unavailable. Enable local storage and try again.", cause);
      }
      if (raw === null) {
        const data = validateDatabase(seed());
        this.write(data);
        return { data: structuredClone(data), revision: 0, token: null };
      }
      try {
        const envelope = JSON.parse(raw);
        if (envelope.version !== SCHEMA_VERSION) throw new Error("Unsupported version");
        const revision = envelope.revision === undefined ? 0 : envelope.revision;
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid revision");
        if (
          envelope.writeToken !== undefined &&
          (typeof envelope.writeToken !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(envelope.writeToken))
        )
          throw new Error("Invalid write token");
        return { data: structuredClone(validateDatabase(envelope.data)), revision, token: envelope.writeToken ?? null };
      } catch (cause) {
        throw new StorageError(
          "Saved demo data is invalid or uses an unsupported version. Existing data has been preserved.",
          cause,
        );
      }
    },
    write(data, revision = 0, writeToken) {
      validateDatabase(data);
      if (!Number.isSafeInteger(revision) || revision < 0) throw new StorageError("Invalid saved data revision.");
      if (writeToken !== undefined && (typeof writeToken !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(writeToken)))
        throw new StorageError("Invalid saved data write token.");
      try {
        storage.setItem(DATABASE_KEY, JSON.stringify({ version: SCHEMA_VERSION, revision, writeToken, data }));
      } catch (cause) {
        throw new StorageError("Demo data could not be saved. Browser storage may be full or blocked.", cause);
      }
    },
  };
}
