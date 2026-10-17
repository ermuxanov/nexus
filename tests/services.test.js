import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseStorage, DATABASE_KEY, StorageError } from "../src/services/storage.js";
import { createSeed } from "../src/services/seed.js";
import { createMockApi } from "../src/services/api.js";
import { createWorkspaceStore } from "../src/store/workspace.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("storage seeds once, persists version and returns isolated data", () => {
  const storage = memoryStorage();
  let seeds = 0;
  const database = createDatabaseStorage(storage, () => {
    seeds += 1;
    return createSeed();
  });
  const first = database.read();
  first.orders[0].totalCents = 0;
  assert.notEqual(database.read().orders[0].totalCents, 0);
  assert.equal(seeds, 1);
  assert.equal(JSON.parse(storage.getItem(DATABASE_KEY)).version, 1);
});

test("invalid data is preserved and read/write failures are explicit", () => {
  const storage = memoryStorage();
  const database = createDatabaseStorage(storage);
  for (const raw of [
    "broken",
    JSON.stringify({ version: 999, data: createSeed() }),
    JSON.stringify({ version: 1, data: {} }),
  ]) {
    storage.setItem(DATABASE_KEY, raw);
    assert.throws(() => database.read(), StorageError);
    assert.equal(storage.getItem(DATABASE_KEY), raw);
  }
  assert.throws(
    () =>
      createDatabaseStorage({
        getItem() {
          throw new Error("blocked");
        },
      }).read(),
    StorageError,
  );
  assert.throws(
    () =>
      createDatabaseStorage({
        setItem() {
          throw new Error("full");
        },
      }).write(createSeed()),
    StorageError,
  );
});

test("version-one snapshots accept legacy data and validate revision metadata", () => {
  const storage = memoryStorage();
  const database = createDatabaseStorage(storage);
  const data = createSeed();
  storage.setItem(DATABASE_KEY, JSON.stringify({ version: 1, data }));
  assert.equal(database.readSnapshot().revision, 0);
  database.write(data, 3, "test-token");
  assert.equal(database.readSnapshot().revision, 3);
  assert.equal(database.readSnapshot().token, "test-token");
  assert.deepEqual(database.read(), data);
  for (const revision of [-1, null, "3", 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const raw = JSON.stringify({ version: 1, revision, data });
    storage.setItem(DATABASE_KEY, raw);
    assert.throws(() => database.readSnapshot(), StorageError);
    assert.equal(storage.getItem(DATABASE_KEY), raw);
  }
  for (const writeToken of [null, 3, "", "x".repeat(129)]) {
    storage.setItem(DATABASE_KEY, JSON.stringify({ version: 1, data, revision: 3, writeToken }));
    assert.throws(() => database.readSnapshot(), StorageError);
  }
});

test("mock API resolves detached records and propagates storage errors", async () => {
  const database = createDatabaseStorage(memoryStorage());
  const api = createMockApi(database, 0);
  const orders = await api.getOrders();
  orders[0].status = "pending";
  assert.notDeepEqual(orders, await api.getOrders());
  assert.deepEqual(await api.getWorkspaceSummary(), { customerCount: 8, orderCount: 32 });
  assert.equal((await api.getCustomers()).length, 8);
  await assert.rejects(
    createMockApi(
      {
        read() {
          throw new Error("blocked");
        },
      },
      0,
    ).getOrders(),
    /blocked/,
  );
});

test("older successful response cannot overwrite a newer response", async () => {
  const responses = [];
  const store = createWorkspaceStore({
    getWorkspaceSummary: () => new Promise((resolve, reject) => responses.push({ resolve, reject })),
  });
  const oldRequest = store.load();
  const newRequest = store.load();
  responses[1].resolve({ orderCount: 40, customerCount: 9 });
  await newRequest;
  responses[0].resolve({ orderCount: 1, customerCount: 1 });
  await oldRequest;
  assert.equal(store.state.summary.orderCount, 40);
  assert.equal(store.state.status, "success");
});

test("older failure cannot replace a newer success; current failure is visible", async () => {
  const responses = [];
  const store = createWorkspaceStore({
    getWorkspaceSummary: () => new Promise((resolve, reject) => responses.push({ resolve, reject })),
  });
  const oldRequest = store.load();
  const newRequest = store.load();
  responses[1].resolve({ orderCount: 32, customerCount: 8 });
  await newRequest;
  responses[0].reject(new Error("outdated failure"));
  await oldRequest;
  assert.equal(store.state.status, "success");
  const currentRequest = store.load();
  responses[2].reject(new Error("current failure"));
  await currentRequest;
  assert.equal(store.state.status, "error");
  assert.equal(store.state.error, "current failure");
});
