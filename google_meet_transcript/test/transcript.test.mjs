import assert from "node:assert/strict";
import test from "node:test";
import { Transcript, BackupSchedule, BACKUP_INTERVAL, exportTranscript } from "../src/transcript.js";

const start = Date.parse("2026-10-02T01:00:00Z");
const row = (key, text, speaker = "Alex") => ({ key, speaker, text });

test("a long meeting retains captions after the visible window evicts them", () => {
  const log = new Transcript("abc-defg-hij", null, start);
  for (let minute = 0; minute < 95; minute += 1) {
    const window = Array.from({ length: Math.min(30, minute + 1) }, (_, index) => {
      const id = minute - Math.min(29, minute) + index;
      return row(id, `Minute ${id}`);
    });
    log.ingest(window, start + minute * 60_000);
  }
  assert.equal(log.entries.length, 95);
  assert.equal(log.entries[0].text, "Minute 0");
  assert.equal(log.entries.at(-1).text, "Minute 94");
  assert.match(exportTranscript(log), /Minute 0/);
});

test("live corrections update one utterance while distinct repeated phrases survive", () => {
  const log = new Transcript("abc-defg-hij", null, start);
  log.ingest([row(1, "We will launch")], start);
  log.ingest([row(1, "We will launch on Friday.")], start + 800);
  log.ingest([row(1, "We will launch on Monday.")], start + 1600);
  log.ingest([row(1, "We will launch on Monday."), row(2, "Yes"), row(3, "Yes")], start + 2000);
  assert.deepEqual(log.entries.map((entry) => entry.text), ["We will launch on Monday.", "Yes", "Yes"]);
  assert.equal(log.entries[0].firstSeenAt, start);
  assert.equal(log.entries[0].updatedAt, start + 1600);
});

test("a new speaker using the same DOM row becomes a separate entry", () => {
  const log = new Transcript("abc-defg-hij", null, start);
  log.ingest([row(1, "Ready?", "Alex")], start);
  log.ingest([row(1, "Ready.", "Sam")], start + 1000);
  assert.deepEqual(log.entries.map((entry) => entry.speaker), ["Alex", "Sam"]);
});

test("a replaced caption panel aligns its overlapping history without replaying it", () => {
  const log = new Transcript("abc-defg-hij", null, start);
  log.ingest([row(1, "First"), row(2, "Second"), row(3, "Third")], start);
  log.ingest([row(20, "Second"), row(30, "Third"), row(40, "Fourth")], start + 1000);
  log.ingest([row(30, "Third"), row(40, "Fourth, corrected")], start + 1500);
  assert.deepEqual(log.entries.map((entry) => entry.text), ["First", "Second", "Third", "Fourth, corrected"]);
});

test("an empty caption window makes a later identical utterance a new entry", () => {
  const log = new Transcript("abc-defg-hij", null, start);
  log.ingest([row(1, "Yes")], start);
  log.ingest([], start + 500);
  log.ingest([row(2, "Yes")], start + 1000);
  assert.equal(log.entries.length, 2);
});

test("a same-task correction is kept when the DOM row is removed", () => {
  const log = new Transcript("abc-defg-hij", null, start);
  log.ingest([row(1, "Ship on")], start);
  assert.equal(log.updateDetached(row(1, "Ship on Friday."), start + 500), true);
  log.ingest([], start + 500);
  assert.equal(log.entries[0].text, "Ship on Friday.");
});

test("reload restores history and resumes against the visible tail", () => {
  const original = new Transcript("abc-defg-hij", null, start);
  original.ingest([row(1, "Old"), row(2, "Still visible")], start);
  const restored = new Transcript("abc-defg-hij", JSON.parse(JSON.stringify(original.serialize())), start + 1000);
  restored.ingest([], start + 1200);
  restored.ingest([row("replacement", "Still visible"), row("new", "After reload")], start + 1500);
  assert.deepEqual(restored.entries.map((entry) => entry.text), ["Old", "Still visible", "After reload"]);
  assert.equal(restored.startedAt, start);
  assert.equal(new Transcript("zzz-yyyy-xxx", original.serialize(), start).entries.length, 0);
});

test("bad recovery data cannot break a new log", () => {
  const broken = { version: 1, room: "abc-defg-hij", startedAt: start, entries: [{ id: "bad" }] };
  const log = new Transcript("abc-defg-hij", broken, start);
  assert.equal(log.entries.length, 0);
  assert.equal(log.ingest([row(1, "Recovered normally")], start), true);
});

test("automatic backups are due at 30 minutes, skip unchanged data, and catch up once", () => {
  const schedule = new BackupSchedule({}, start);
  assert.equal(schedule.due(1, start + BACKUP_INTERVAL - 1), false);
  assert.equal(schedule.due(1, start + BACKUP_INTERVAL), true);
  schedule.markSaved(1, start + BACKUP_INTERVAL);
  assert.equal(schedule.due(1, start + BACKUP_INTERVAL * 5), false);
  assert.equal(schedule.due(2, start + BACKUP_INTERVAL * 5), true);
  schedule.markSaved(2, start + BACKUP_INTERVAL * 5);
  assert.equal(schedule.due(2, start + BACKUP_INTERVAL * 5 + 1), false);
  assert.equal(schedule.nextAt, start + BACKUP_INTERVAL * 6);
});

test("a manual download resets the backup interval and the schedule survives reload", () => {
  const schedule = new BackupSchedule({}, start);
  schedule.markSaved(8, start + 29 * 60_000);
  const restored = new BackupSchedule(schedule.serialize(), start + 30 * 60_000);
  assert.equal(restored.due(9, start + 31 * 60_000), false);
  assert.equal(restored.due(9, start + 59 * 60_000), true);
});

test("exports preserve multilingual text, speaker aliases, and first-observed times", () => {
  const log = new Transcript("abc-defg-hij", null, start);
  log.ingest([row(1, "회의를 시작하겠습니다。", "あなた"), row(2, "<img src=x> **literal**", "[Sam]")], start);
  const txt = exportTranscript(log, "txt", "mlajkim");
  assert.match(txt, /\[01:00:00\] mlajkim/);
  assert.match(txt, /회의를 시작하겠습니다。/);
  const json = JSON.parse(exportTranscript(log, "json", "mlajkim"));
  assert.equal(json.entries[0].speaker, "mlajkim");
  assert.equal(json.entries[1].text, "<img src=x> **literal**");
  const markdown = exportTranscript(log, "md");
  assert.ok(markdown.includes("\\<img src=x\\> \\*\\*literal\\*\\*"));
  assert.equal(log.entries[0].speaker, "あなた");
});
