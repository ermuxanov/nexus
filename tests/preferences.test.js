import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES, validatePreferences, initials } from "../src/domain/preferences.js";
import { createPreferencesStorage, PREFERENCES_KEY } from "../src/services/preferences.js";
import { createPreferencesStore } from "../src/store/preferences.js";

function fixture() {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const service = createPreferencesStorage(() => storage);
  return { values, storage, service };
}

test("preferences validate every required field, trim input and constrain supported view defaults", () => {
  assert.deepEqual(validatePreferences(DEFAULT_PREFERENCES).data, DEFAULT_PREFERENCES);
  const trimmed = validatePreferences({
    ...DEFAULT_PREFERENCES,
    workspaceName: "  Atlas workspace  ",
    ownerName: " Alex Morgan ",
  });
  assert.equal(trimmed.data.workspaceName, "Atlas workspace");
  assert.equal(trimmed.data.ownerName, "Alex Morgan");
  for (const invalid of [
    null,
    {},
    { ...DEFAULT_PREFERENCES, ownerName: " " },
    { ...DEFAULT_PREFERENCES, workspaceName: "x".repeat(81) },
    { ...DEFAULT_PREFERENCES, ownerName: "x".repeat(81) },
    { ...DEFAULT_PREFERENCES, ownerEmail: "bad" },
    { ...DEFAULT_PREFERENCES, reportingDays: "365" },
    { ...DEFAULT_PREFERENCES, rowsPerPage: 20 },
    { ...DEFAULT_PREFERENCES, rowsPerPage: "15" },
  ])
    assert.equal(validatePreferences(invalid).data, null);
  assert.equal(initials("Jamie Davis"), "JD");
  assert.equal(initials("  Alex  "), "A");
  assert.equal(initials("𐐀lex Morgan"), "𐐀M");
});

test("missing preferences return detached defaults without writing; valid version-one data survives reload", () => {
  const { values, service } = fixture();
  const first = service.read();
  first.ownerName = "Detached";
  assert.equal(service.read().ownerName, "Jamie Davis");
  assert.equal(values.size, 0);
  const draft = { ...DEFAULT_PREFERENCES, ownerName: "Alex Morgan", rowsPerPage: "20", reportingDays: "7" };
  const saved = service.write(draft, DEFAULT_PREFERENCES);
  assert.deepEqual(saved, draft);
  assert.equal(JSON.parse(values.get(PREFERENCES_KEY)).version, 1);
  assert.deepEqual(service.read(), draft);
  saved.ownerName = "Mutated";
  assert.equal(service.read().ownerName, "Alex Morgan");
});

test("corrupt, unsupported and invalid preferences are preserved rather than overwritten", () => {
  const { values, service } = fixture();
  for (const raw of [
    "{",
    "null",
    JSON.stringify({ version: 2, data: DEFAULT_PREFERENCES }),
    JSON.stringify({ version: 1, data: { ...DEFAULT_PREFERENCES, reportingDays: "1" } }),
  ]) {
    values.set(PREFERENCES_KEY, raw);
    assert.throws(() => service.read(), /invalid or unsupported/);
    assert.throws(() => service.write(DEFAULT_PREFERENCES, DEFAULT_PREFERENCES), /invalid or unsupported/);
    assert.equal(values.get(PREFERENCES_KEY), raw);
  }
});

test("sequential external changes reject stale settings and invalid inputs never write", () => {
  const { values, service } = fixture();
  const previous = service.read();
  const changed = { ...previous, ownerName: "Changed in another tab" };
  service.write(changed, previous);
  const before = values.get(PREFERENCES_KEY);
  assert.throws(() => service.write({ ...previous, ownerName: "Stale" }, previous), /changed in another tab/);
  assert.equal(values.get(PREFERENCES_KEY), before);
  assert.throws(() => service.write({ ...changed, ownerEmail: "bad" }, changed), /highlighted/);
  assert.equal(values.get(PREFERENCES_KEY), before);
  assert.doesNotThrow(() => service.write({ ...changed, ownerName: "Reviewed" }, service.read()));
});

test("blocked reads and failed writes stay visible and preserve saved store state until retry succeeds", () => {
  const { storage, service } = fixture();
  const store = createPreferencesStore(service);
  assert.equal(store.load(), true);
  const setItem = storage.setItem;
  storage.setItem = () => {
    throw new Error("Full");
  };
  const draft = { ...DEFAULT_PREFERENCES, ownerName: "Retained draft" };
  assert.equal(store.save(draft), false);
  assert.equal(store.state.data.ownerName, "Jamie Davis");
  assert.match(store.state.error, /could not be saved/);
  assert.equal(draft.ownerName, "Retained draft");
  storage.setItem = setItem;
  assert.equal(store.save(draft), true);
  assert.equal(store.state.error, "");
  const getItem = storage.getItem;
  storage.getItem = () => {
    throw new Error("Blocked");
  };
  assert.equal(store.load(), false);
  assert.equal(store.state.status, "error");
  assert.equal(store.state.data.ownerName, "Retained draft");
  storage.getItem = getItem;
  assert.equal(store.load(), true);
  assert.equal(store.state.status, "success");
  assert.throws(
    () =>
      createPreferencesStorage(() => {
        throw new Error("Denied");
      }).read(),
    /could not be read/,
  );
});
