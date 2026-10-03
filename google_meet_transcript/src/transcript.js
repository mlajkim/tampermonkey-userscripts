export const BACKUP_INTERVAL = 30 * 60 * 1000;

export function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function sameCaption(left, right) {
  return left.speaker === right.speaker && left.text === right.text;
}

// Align only consecutive rows at the edge of a replaced panel. Globally
// deduplicating text would incorrectly erase repeated phrases such as "yes".
function overlapLength(previous, current) {
  for (let size = Math.min(previous.length, current.length); size > 0; size -= 1) {
    const offset = previous.length - size;
    if (current.slice(0, size).every((row, index) => sameCaption(previous[offset + index], row))) {
      return size;
    }
  }
  return 0;
}

export class Transcript {
  constructor(room, saved = null, now = Date.now()) {
    this.room = room;
    this.startedAt = now;
    this.entries = [];
    this.revision = 0;
    this.nextId = 1;
    this.bindings = new Map();
    this.previousWindow = [];
    this.restorePending = false;

    if (saved?.version === 1 && saved.room === room && Array.isArray(saved.entries)) {
      const valid = saved.entries.every((entry) =>
        entry && Number.isSafeInteger(entry.id) && entry.id > 0 &&
        typeof entry.speaker === "string" && typeof entry.text === "string" &&
        Number.isFinite(entry.firstSeenAt) && Number.isFinite(entry.updatedAt));
      const ids = new Set(saved.entries.map((entry) => entry?.id));
      if (valid && ids.size === saved.entries.length && Number.isFinite(saved.startedAt)) {
        this.startedAt = saved.startedAt;
        this.entries = saved.entries.map((entry) => ({ ...entry }));
        this.nextId = this.entries.reduce((max, entry) => Math.max(max, entry.id + 1), 1);
        this.revision = Number.isSafeInteger(saved.revision) ? saved.revision : this.entries.length;
        this.restorePending = this.entries.length > 0;
      }
    }
  }

  // A frame is the ordered set of caption rows currently present in the DOM.
  // Keys are DOM elements supplied by the adapter, never caption text.
  ingest(frame, now = Date.now()) {
    const rows = frame.map((row) => ({
      key: row.key,
      speaker: cleanText(row.speaker),
      text: cleanText(row.text),
    })).filter((row) => row.speaker && row.text);
    const previousRevision = this.revision;
    const anyBound = rows.some((row) => this.bindings.has(row.key));

    if (rows.length && !anyBound) {
      const previous = this.restorePending ? this.entries : this.previousWindow;
      const count = overlapLength(previous, rows);
      for (let index = 0; index < count; index += 1) {
        this.bindings.set(rows[index].key, previous[previous.length - count + index]);
      }
    }

    const active = new Map();
    for (const row of rows) {
      let entry = this.bindings.get(row.key);
      if (!entry || entry.speaker !== row.speaker) {
        entry = {
          id: this.nextId++,
          speaker: row.speaker,
          text: row.text,
          firstSeenAt: now,
          updatedAt: now,
        };
        this.entries.push(entry);
        this.revision += 1;
      } else if (entry.text !== row.text) {
        // Meet can correct or extend a live caption before it is final.
        entry.text = row.text;
        entry.updatedAt = now;
        this.revision += 1;
      }
      active.set(row.key, entry);
    }
    this.bindings = active;
    this.previousWindow = [...active.values()];
    if (rows.length) this.restorePending = false;
    return this.revision !== previousRevision;
  }

  // Include the last revision of a known row that was removed in the same
  // browser task as a text update. Do not restore it to the active DOM window.
  updateDetached(row, now = Date.now()) {
    const entry = this.bindings.get(row.key);
    if (!entry) return false;
    const speaker = cleanText(row.speaker);
    const text = cleanText(row.text);
    if (!text || speaker !== entry.speaker || text === entry.text) return false;
    entry.text = text;
    entry.updatedAt = now;
    this.revision += 1;
    return true;
  }

  serialize() {
    return {
      version: 1,
      room: this.room,
      startedAt: this.startedAt,
      revision: this.revision,
      entries: this.entries.map((entry) => ({ ...entry })),
    };
  }
}

export class BackupSchedule {
  constructor(saved = {}, now = Date.now()) {
    this.nextAt = Number.isFinite(saved?.nextAt) ? saved.nextAt : now + BACKUP_INTERVAL;
    this.savedRevision = Number.isSafeInteger(saved?.savedRevision) ? saved.savedRevision : 0;
  }

  due(revision, now = Date.now()) {
    return now >= this.nextAt && revision !== this.savedRevision;
  }

  markSaved(revision, now = Date.now()) {
    this.savedRevision = revision;
    this.nextAt = now + BACKUP_INTERVAL;
  }

  serialize() {
    return { nextAt: this.nextAt, savedRevision: this.savedRevision };
  }
}

export function speakerName(speaker, ownName = "") {
  const self = /^(?:you|あなた|自分|나|본인)(?:\s*\((?:you|나|본인)\))?$/iu;
  return ownName.trim() && self.test(speaker) ? ownName.trim() : speaker;
}

function clockLabel(timestamp) {
  return new Date(timestamp).toISOString().slice(11, 19);
}

function escapeMarkdown(value) {
  return value.replace(/[\\`*_{}\[\]<>()#+.!|~-]/gu, "\\$&");
}

export function exportTranscript(log, format = "txt", ownName = "") {
  const data = log.serialize();
  const entries = data.entries.map((entry) => ({ ...entry, speaker: speakerName(entry.speaker, ownName) }));
  if (format === "json") {
    return JSON.stringify({ ...data, entries }, null, 2) + "\n";
  }
  const title = `Google Meet transcript — ${data.room}`;
  const start = `Started: ${new Date(data.startedAt).toISOString()}`;
  const timing = "Timestamps are when captions were first observed (UTC).";
  if (format === "md") {
    const sections = entries.map((entry) =>
      `### ${clockLabel(entry.firstSeenAt)} · ${escapeMarkdown(entry.speaker)}\n\n${escapeMarkdown(entry.text)}`);
    return `# ${title}\n\n${start}\n\n${timing}\n\n${sections.join("\n\n")}\n`;
  }
  return `${title}\n${start}\n${timing}\n\n` + entries.map((entry) =>
    `[${clockLabel(entry.firstSeenAt)}] ${entry.speaker}\n${entry.text}\n`).join("\n");
}

export function exportFilename(room, format, now = Date.now(), final = false) {
  const timestamp = new Date(now).toISOString().replace(/[:.]/gu, "-");
  const extension = ["txt", "md", "json"].includes(format) ? format : "txt";
  return `meet-${room}-${timestamp}${final ? "-final" : ""}.${extension}`;
}
