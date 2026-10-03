import assert from "node:assert/strict";
import test from "node:test";
import { RoomRecovery } from "../src/recovery.js";

function memoryStorage() {
  const contents = new Map();
  return { getItem: (key) => contents.get(key) ?? null, setItem: (key, value) => contents.set(key, value) };
}
const room = "abc-defg-hij";
const state = { transcript: { version: 1, room, entries: [{ text: "Still recoverable" }] }, autoFinish: false };

test("a new tab can recover the persistent log and saved checkbox setting", () => {
  const persistent = memoryStorage();
  const first = new RoomRecovery(room, { tab: () => memoryStorage(), persistent: () => persistent });
  assert.deepEqual(first.save(state), { tab: true, persistent: true });
  const reopened = new RoomRecovery(room, { tab: () => memoryStorage(), persistent: () => persistent });
  assert.deepEqual(reopened.load(), { state, fromClosedTab: true });
});

test("a live tab keeps its own log when another tab writes a newer recovery copy", () => {
  const tab = memoryStorage();
  const persistent = memoryStorage();
  const recovery = new RoomRecovery(room, { tab: () => tab, persistent: () => persistent });
  recovery.save(state);
  persistent.setItem(recovery.key, JSON.stringify({ ...state, autoFinish: true }));
  assert.deepEqual(recovery.load(), { state, fromClosedTab: false });
});

test("persistent storage failure preserves tab recovery and reports the limitation", () => {
  const tab = memoryStorage();
  const recovery = new RoomRecovery(room, { tab: () => tab, persistent: () => { throw new Error("blocked"); } });
  assert.deepEqual(recovery.save(state), { tab: true, persistent: false });
  assert.deepEqual(recovery.load().state, state);
});

test("unreadable tab data falls back to local recovery without mixing rooms", () => {
  const tab = memoryStorage();
  const persistent = memoryStorage();
  const recovery = new RoomRecovery(room, { tab: () => tab, persistent: () => persistent });
  recovery.save(state);
  tab.setItem(recovery.key, "invalid json");
  assert.equal(recovery.load().fromClosedTab, true);
  const otherRoom = new RoomRecovery("klm-nopq-rst", { tab: () => tab, persistent: () => persistent });
  assert.equal(otherRoom.load().state, null);
});
