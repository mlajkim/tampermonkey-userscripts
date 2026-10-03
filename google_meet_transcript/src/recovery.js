export class RoomRecovery {
  constructor(room, stores) {
    this.key = `google-meet-transcript:v1:${room}`;
    this.room = room;
    this.stores = stores;
  }

  read(store) {
    try {
      const state = JSON.parse(store().getItem(this.key) || "null");
      return state?.transcript?.version === 1 && state.transcript.room === this.room &&
        Array.isArray(state.transcript.entries) ? state : null;
    } catch {
      return null;
    }
  }

  load() {
    const tab = this.read(this.stores.tab);
    if (tab) return { state: tab, fromClosedTab: false };
    const state = this.read(this.stores.persistent);
    return { state, fromClosedTab: Boolean(state?.transcript.entries.length) };
  }

  save(state) {
    const encoded = JSON.stringify(state);
    const saved = {};
    for (const [name, storage] of Object.entries(this.stores)) {
      try {
        storage().setItem(this.key, encoded);
        saved[name] = true;
      } catch {
        saved[name] = false;
      }
    }
    return saved;
  }
}
