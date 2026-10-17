import test from "node:test";
import assert from "node:assert/strict";
import { createWriteCoordinator } from "../src/services/writeCoordinator.js";
import { StorageError } from "../src/services/storage.js";

// Drive browser lifecycle events explicitly; real cross-tab serialization is checked in browser acceptance.
function fixture(revision = 0, committedRevision, token = null, createToken = () => "new-token") {
  const request = {};
  const lock = { result: committedRevision };
  const reservation = {};
  const calls = [];
  const transaction = {
    objectStore(name) {
      calls.push(["store", name]);
      return {
        get(key) {
          calls.push(["get", key]);
          return lock;
        },
        put(value, key) {
          calls.push(["put", value, key]);
          return reservation;
        },
      };
    },
    abort() {
      calls.push(["abort"]);
      this.onabort();
    },
  };
  const database = {
    createObjectStore(name) {
      calls.push(["create", name]);
    },
    transaction(name, mode) {
      calls.push(["transaction", name, mode]);
      return transaction;
    },
    close() {
      calls.push(["close"]);
    },
  };
  request.result = database;
  const snapshot = { data: { example: "snapshot" }, revision, token };
  const storage = {
    readSnapshot: () => snapshot,
    write: (data, nextRevision, nextToken) => calls.push(["write", data, nextRevision, nextToken]),
  };
  const coordinate = createWriteCoordinator(
    storage,
    () => ({
      open(name, version) {
        calls.push(["open", name, version]);
        return request;
      },
    }),
    createToken,
  );
  return { request, lock, reservation, calls, transaction, database, coordinate };
}

test("mutation waits for the marker write and reports success only after transaction completion", async () => {
  const { request, lock, reservation, calls, transaction, coordinate } = fixture();
  let mutations = 0;
  let finished = false;
  const result = coordinate((database) => {
    mutations++;
    assert.deepEqual(database.read(), { example: "snapshot" });
    database.write({ example: "saved" });
    return { id: "NX-1049" };
  }).then((value) => {
    finished = true;
    return value;
  });
  assert.equal(mutations, 0);
  request.onupgradeneeded();
  request.onsuccess();
  assert.deepEqual(calls.slice(1), [
    ["create", "orders"],
    ["transaction", "orders", "readwrite"],
    ["store", "orders"],
    ["get", "revision"],
  ]);
  assert.equal(mutations, 0);
  lock.onsuccess();
  assert.equal(mutations, 0);
  assert.deepEqual(calls.at(-1), ["put", { revision: 1, token: "new-token" }, "revision"]);
  reservation.onsuccess();
  assert.deepEqual(calls.at(-1), ["write", { example: "saved" }, 1, "new-token"]);
  await Promise.resolve();
  assert.equal(mutations, 1);
  assert.equal(finished, false);
  transaction.oncomplete();
  assert.deepEqual(await result, { id: "NX-1049" });
  assert.deepEqual(calls.at(-1), ["close"]);
});

test("missing or blocked coordination never falls back to an unguarded mutation", async () => {
  let mutations = 0;
  const operation = () => mutations++;
  await assert.rejects(createWriteCoordinator(null, () => undefined)(operation), StorageError);
  await assert.rejects(
    createWriteCoordinator(null, () => {
      throw new Error("blocked access");
    })(operation),
    /Safe saving is unavailable/,
  );
  const { coordinate, request, calls } = fixture();
  const result = coordinate(operation);
  const rejected = assert.rejects(result, /Close other NEXUS tabs/);
  request.onblocked();
  await rejected;
  request.onsuccess();
  assert.equal(mutations, 0);
  assert.deepEqual(calls.at(-1), ["close"]);
});

test("opening and transaction failures stay visible without running the mutation", async () => {
  for (const failure of ["open", "transaction", "request"]) {
    const { coordinate, request, transaction, database } = fixture();
    let mutations = 0;
    const result = coordinate(() => mutations++);
    const rejected = assert.rejects(result, StorageError);
    if (failure === "open") {
      request.error = new Error("open denied");
      request.onerror();
    } else if (failure === "transaction") {
      database.transaction = () => {
        throw new Error("connection closed");
      };
      request.onsuccess();
    } else {
      request.onsuccess();
      transaction.error = new Error("marker write denied");
      transaction.onabort();
    }
    await rejected;
    assert.equal(mutations, 0);
  }
});

test("validation or LocalStorage failure aborts coordination and preserves its actionable error", async () => {
  const { coordinate, request, lock, reservation, calls } = fixture();
  const error = new StorageError("Demo data could not be saved.");
  const result = coordinate(() => {
    throw error;
  });
  const rejected = assert.rejects(result, (actual) => actual === error);
  request.onsuccess();
  lock.onsuccess();
  reservation.onsuccess();
  await rejected;
  assert.deepEqual(calls.slice(-2), [["abort"], ["close"]]);
});

test("stale or invalid committed revisions reject before mutation or revision reservation", async () => {
  for (const committedRevision of [2, -1, null, "invalid", Number.MAX_SAFE_INTEGER + 1]) {
    const { coordinate, request, lock, calls } = fixture(1, committedRevision);
    let mutations = 0;
    const result = coordinate(() => mutations++);
    const rejected = assert.rejects(result, StorageError);
    request.onsuccess();
    lock.onsuccess();
    await rejected;
    assert.equal(mutations, 0);
    assert.equal(
      calls.some(([name]) => name === "put" || name === "write"),
      false,
    );
  }
});

test("higher local revision can recover a failed commit; revision overflow fails without writing", async () => {
  const { coordinate, request, lock, reservation, calls, transaction } = fixture(5, 4);
  const result = coordinate((database) => database.write({ recovered: true }));
  request.onsuccess();
  lock.onsuccess();
  assert.deepEqual(calls.at(-1), ["put", { revision: 6, token: "new-token" }, "revision"]);
  reservation.onsuccess();
  transaction.oncomplete();
  await result;
  assert.ok(calls.some(([name, , revision]) => name === "write" && revision === 6));

  const overflow = fixture(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const failed = overflow.coordinate(() => assert.fail("Must not mutate"));
  const rejected = assert.rejects(failed, /revision limit/);
  overflow.request.onsuccess();
  overflow.lock.onsuccess();
  await rejected;
});

test("same revision with a different write token cannot overwrite an acknowledged snapshot", async () => {
  const { coordinate, request, lock, calls } = fixture(2, { revision: 2, token: "committed-token" }, "aborted-token");
  const result = coordinate(() => assert.fail("Stale cache must not mutate"));
  const rejected = assert.rejects(result, /updated in another tab/);
  request.onsuccess();
  lock.onsuccess();
  await rejected;
  assert.equal(
    calls.some(([name]) => name === "write" || name === "put"),
    false,
  );
});

test("unavailable or malformed write identities fail before reservation or mutation", async () => {
  for (const createToken of [
    () => null,
    () => "invalid token",
    () => {
      throw new Error("unavailable");
    },
  ]) {
    const { coordinate, request, lock, calls } = fixture(0, undefined, null, createToken);
    const result = coordinate(() => assert.fail("Must not mutate"));
    const rejected = assert.rejects(result, /Safe saving is unavailable/);
    request.onsuccess();
    lock.onsuccess();
    await rejected;
    assert.equal(
      calls.some(([name]) => name === "put" || name === "write"),
      false,
    );
  }
});
