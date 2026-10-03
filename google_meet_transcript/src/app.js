import { Transcript, BackupSchedule, exportTranscript, exportFilename } from "./transcript.js";
import { captionRegions, captionRows, readCaptionRow } from "./captions.js";
import { RoomRecovery } from "./recovery.js";
import { clickedLeaveControl, meetingHasEnded, roomFromPath } from "./meeting.js";

const PANEL_ID = "google-meet-transcript-panel";

function element(tag, attributes = {}, text = "") {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.textContent = text;
  return node;
}

function downloadTranscript(content, filename, format) {
  const types = { txt: "text/plain", md: "text/markdown", json: "application/json" };
  const blob = new Blob([content], { type: `${types[format] || types.txt};charset=utf-8` });
  const address = URL.createObjectURL(blob);
  const link = element("a", { href: address, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  // Leave time for the browser to start reading the Blob.
  setTimeout(() => URL.revokeObjectURL(address), 60_000);
}

function startRoom(room) {
  const recovery = new RoomRecovery(room, {
    tab: () => sessionStorage,
    persistent: () => localStorage,
  });
  const { state: recovered, fromClosedTab } = recovery.load();
  let storageFailed = false;
  let persistentFailed = false;
  let log = new Transcript(room, recovered?.transcript);
  let schedule = new BackupSchedule(recovered?.schedule);
  let capturing = true;
  let finished = false;
  let knownRows = [];
  let pendingWrite = null;
  let latestBackup = Number.isFinite(recovered?.latestBackup) ? recovered.latestBackup : 0;
  let regionFound = false;
  let exportError = "";

  const host = element("div", { id: PANEL_ID });
  const shadow = host.attachShadow({ mode: "open" });
  const style = element("style", {}, `
    :host { all: initial; position: fixed; right: 18px; bottom: 88px; z-index: 2147483000;
      color-scheme: light; font: 13px/1.45 system-ui, sans-serif; color: #172b3a; }
    * { box-sizing: border-box; }
    .panel { width: 292px; max-width: calc(100vw - 36px); background: #fff;
      border: 1px solid #ccd7df; border-radius: 12px; box-shadow: 0 6px 24px #0003; }
    .panel-header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
    .panel-heading { flex: 1; min-width: 0; }
    button.disclosure { display: flex; align-items: center; gap: 6px; padding: 0;
      border: 0; font-weight: 650; text-align: left; }
    .chevron { display: inline-block; }
    .disclosure[aria-expanded=false] .chevron { transform: rotate(-90deg); }
    .recording-status { display: flex; align-items: center; gap: 7px; margin-top: 5px;
      color: #526574; font-size: 12px; }
    .recording-dot { width: 9px; height: 9px; flex: 0 0 9px; border-radius: 50%; background: currentColor; }
    .recording-status.recording { color: #b91c1c; }
    .recording-status.recording .recording-dot { box-shadow: 0 0 0 3px #b91c1c1a; }
    button.capture { flex-shrink: 0; min-width: 68px; font-weight: 650; }
    button.capture.recording { background: #b91c1c; color: #fff; border-color: #b91c1c; }
    .body { padding: 0 14px 14px; }
    p { margin: 0 0 10px; }
    .muted { color: #526574; font-size: 12px; }
    .actions { display: flex; gap: 7px; margin: 12px 0; }
    button, select, input[type=text] { font: inherit; color: inherit; border: 1px solid #b9c9d4;
      border-radius: 6px; padding: 7px 9px; background: #fff; }
    button { cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible {
      outline: 2px solid #0c83c5; outline-offset: 2px; }
    .export { display: flex; gap: 7px; margin-bottom: 12px; }
    .export button { flex: 1; }
    label { display: block; margin: 9px 0; }
    input[type=checkbox] { vertical-align: middle; }
    input[type=text] { width: 100%; margin-top: 5px; }
    .options summary { cursor: pointer; padding: 6px 0; font-size: 12px; font-weight: 650; }
    .warning { color: #8a3912; }
    [hidden] { display: none; }
  `);
  const panel = element("section", { class: "panel", "aria-label": "Meet transcript" });
  const header = element("div", { class: "panel-header" });
  const heading = element("div", { class: "panel-heading" });
  const disclosure = element("button", { id: "collapse", type: "button", class: "disclosure",
    "aria-expanded": "true", "aria-controls": "panel-body", title: "Collapse panel" });
  disclosure.append(element("span", { class: "chevron", "aria-hidden": "true" }, "▾"), document.createTextNode("Meet transcript"));
  const recordingStatus = element("div", { id: "recording-status", class: "recording-status", role: "status", "aria-live": "polite" });
  const recordingLabel = element("span", { id: "recording-label" });
  recordingStatus.append(element("span", { class: "recording-dot", "aria-hidden": "true" }), recordingLabel);
  heading.append(disclosure, recordingStatus);
  const toggle = element("button", { id: "capture", type: "button", class: "capture" }, "Record");
  header.append(heading, toggle);
  const body = element("div", { id: "panel-body", class: "body" });
  const status = element("p", { id: "status", role: "status", "aria-live": "polite" });
  const hint = element("p", { id: "hint", class: "muted" });
  const actions = element("div", { class: "actions" });
  const reset = element("button", { id: "reset", type: "button" }, "New log");
  actions.append(reset);
  const exports = element("div", { class: "export" });
  const format = element("select", { id: "format", "aria-label": "Download format" });
  for (const [value, label] of [["txt", "Text"], ["md", "Markdown"], ["json", "JSON"]]) {
    format.append(element("option", { value }, label));
  }
  format.value = ["txt", "md", "json"].includes(recovered?.format) ? recovered.format : "txt";
  const download = element("button", { id: "download", type: "button" }, "Download full log");
  exports.append(format, download);
  const autoLabel = element("label");
  const automatic = element("input", { id: "automatic", type: "checkbox" });
  automatic.checked = recovered?.automatic !== false;
  autoLabel.append(automatic, document.createTextNode(" Auto-download every 30 minutes"));
  const finishLabel = element("label");
  const autoFinish = element("input", { id: "auto-finish", type: "checkbox" });
  autoFinish.checked = recovered?.autoFinish !== false;
  finishLabel.append(autoFinish, document.createTextNode(" Auto-download remaining captions when done"));
  const finishHint = element("p", { class: "muted" }, "Saves the full log when leaving or ending a call. Tab-close downloads depend on your browser.");
  const backupStatus = element("p", { id: "backup-status", class: "muted" });
  const options = element("details", { class: "options" });
  options.append(element("summary", {}, "Options"));
  const nameLabel = element("label", { for: "own-name" }, "Name to use for “You” (optional)");
  const ownName = element("input", { id: "own-name", type: "text", maxlength: "120", autocomplete: "off" });
  ownName.value = typeof recovered?.ownName === "string" ? recovered.ownName.slice(0, 120) : "";
  nameLabel.append(ownName);
  options.append(nameLabel);
  const warning = element("p", { id: "warning", class: "muted warning", role: "alert", hidden: "" });
  const recoveryNotice = element("p", { class: "muted", id: "recovery-notice" }, "Recovered the last log for this meeting. Download it or use New log to start fresh.");
  recoveryNotice.hidden = !fromClosedTab;
  body.append(status, hint, recoveryNotice, actions, exports, autoLabel, backupStatus, finishLabel, finishHint, options, warning);
  panel.append(header, body);
  shadow.append(style, panel);
  document.body.append(host);

  function render(now = Date.now()) {
    const recording = capturing && !finished && regionFound;
    const nextRecordingLabel = recording ? "Recording" : "Not recording";
    if (recordingLabel.textContent !== nextRecordingLabel) recordingLabel.textContent = nextRecordingLabel;
    recordingStatus.classList.toggle("recording", recording);
    recordingStatus.title = finished ? "Meeting ended" : !capturing ? "Capture is paused" :
      !regionFound ? "Turn on Meet captions to start recording" : "Collecting Meet captions";
    const nextStatus = `${finished ? "Finished" : capturing ? "Capturing" : "Paused"} · ${log.entries.length} captions`;
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    toggle.textContent = capturing ? "Pause" : "Record";
    toggle.classList.toggle("recording", recording);
    toggle.title = capturing ? "Pause caption recording" : log.entries.length ? "Resume caption recording" : "Start caption recording";
    toggle.setAttribute("aria-label", toggle.title);
    download.disabled = !log.entries.length;
    reset.disabled = !log.entries.length;
    hint.textContent = finished ? "Meeting ended. Your full log is available to download." :
      !capturing ? "Capture is paused. Resume when you are ready." :
      !regionFound ? "Waiting for Meet’s caption panel. Turn on captions." :
        !log.entries.length ? "Caption panel found. Waiting for speech." :
          "Keeping captions as they appear, including older entries.";
    if (!automatic.checked) {
      backupStatus.textContent = "Periodic downloads are off. Local recovery stays on.";
    } else if (!capturing) {
      backupStatus.textContent = "Automatic downloads run while capturing.";
    } else if (now >= schedule.nextAt && log.revision === schedule.savedRevision) {
      backupStatus.textContent = "No new captions to back up.";
    } else {
      const seconds = Math.max(0, Math.ceil((schedule.nextAt - now) / 1000));
      backupStatus.textContent = `Next backup in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.`;
    }
    if (latestBackup) backupStatus.textContent += ` Last download requested at ${new Date(latestBackup).toLocaleTimeString()}.`;
    warning.textContent = exportError || (storageFailed ? "Local recovery is unavailable. Download your log before leaving." :
      persistentFailed ? "Recovery will not survive closing this tab. Download your log before leaving." : "");
    warning.hidden = !warning.textContent;
  }

  function writeRecovery() {
    if (pendingWrite !== null) clearTimeout(pendingWrite);
    pendingWrite = null;
    const saved = recovery.save({
      transcript: log.serialize(),
      schedule: schedule.serialize(),
      latestBackup,
      automatic: automatic.checked,
      autoFinish: autoFinish.checked,
      format: format.value,
      ownName: ownName.value,
    });
    storageFailed = !saved.tab && !saved.persistent;
    persistentFailed = !saved.persistent;
    render();
  }

  function queueRecovery() {
    // Throttle instead of debounce: uninterrupted speech still gets saved.
    if (pendingWrite === null) pendingWrite = setTimeout(writeRecovery, 500);
  }

  function scan() {
    if (!capturing || roomFromPath(location.pathname) !== room) return;
    const regions = captionRegions(document);
    regionFound = regions.length > 0;
    let changed = false;
    for (const previous of knownRows) {
      if (!previous.key.isConnected) {
        const finalRow = readCaptionRow(previous.key);
        if (finalRow) changed = log.updateDetached(finalRow) || changed;
      }
    }
    if (regionFound) {
      const rows = captionRows(regions);
      changed = log.ingest(rows) || changed;
      knownRows = rows;
    }
    if (changed) queueRecovery();
    render();
  }

  function saveDownload(final = false) {
    scan();
    if (!log.entries.length) return;
    // Save synchronously before requesting a download. The browser may reject
    // a download during page teardown without reporting it to this script.
    writeRecovery();
    const now = Date.now();
    try {
      downloadTranscript(exportTranscript(log, format.value, ownName.value), exportFilename(room, format.value, now, final), format.value);
      schedule.markSaved(log.revision, now);
      latestBackup = now;
      exportError = "";
    } catch {
      exportError = "The download could not start. Try Download full log again.";
    }
    writeRecovery();
  }

  disclosure.addEventListener("click", () => {
    body.hidden = !body.hidden;
    disclosure.setAttribute("aria-expanded", String(!body.hidden));
    disclosure.title = body.hidden ? "Expand panel" : "Collapse panel";
  });
  toggle.addEventListener("click", () => {
    if (capturing) scan();
    if (!capturing && !log.entries.length) schedule = new BackupSchedule();
    capturing = !capturing;
    finished = false;
    if (capturing) scan();
    writeRecovery();
  });
  download.addEventListener("click", () => saveDownload());
  for (const input of [format, ownName, automatic, autoFinish]) input.addEventListener("change", writeRecovery);
  reset.addEventListener("click", () => {
    if (!window.confirm("Start a new log? This removes the current log from this tab. Download it first if you need it.")) return;
    capturing = false;
    finished = false;
    recoveryNotice.hidden = true;
    knownRows = [];
    log = new Transcript(room);
    schedule = new BackupSchedule();
    latestBackup = 0;
    exportError = "";
    writeRecovery();
  });

  function finishDownload() {
    scan();
    writeRecovery();
    if (autoFinish.checked && log.entries.length && log.revision !== schedule.savedRevision) saveDownload(true);
  }

  function refresh() {
    if (roomFromPath(location.pathname) !== room) return;
    scan();
    const ended = meetingHasEnded(document);
    if (ended && !finished) {
      finishDownload();
      finished = true;
      capturing = false;
    } else if (!ended && finished && captionRegions(document).length) {
      finished = false;
      capturing = true;
      scan();
    }
    render();
  }

  // The click capture listener runs while Leave still has a user gesture and
  // before Meet removes its caption panel. Capturing continues if a leave
  // action is cancelled; the ended screen is what marks the log finished.
  const leaveClick = (event) => {
    if (clickedLeaveControl(event)) finishDownload();
  };
  document.addEventListener("click", leaveClick, true);
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "aria-hidden", "hidden"],
  });
  const timer = setInterval(() => {
    refresh();
    if (capturing && automatic.checked && log.entries.length && schedule.due(log.revision)) saveDownload();
    render();
  }, 1000);
  const leaving = () => { scan(); writeRecovery(); };
  // These are best-effort download hooks, not confirmation dialogs. A hard
  // close/crash can skip them, which is why ongoing recovery is persistent.
  window.addEventListener("pagehide", finishDownload);
  window.addEventListener("beforeunload", finishDownload);
  document.addEventListener("visibilitychange", leaving);
  refresh();

  return () => {
    finishDownload();
    observer.disconnect();
    clearInterval(timer);
    document.removeEventListener("click", leaveClick, true);
    window.removeEventListener("pagehide", finishDownload);
    window.removeEventListener("beforeunload", finishDownload);
    document.removeEventListener("visibilitychange", leaving);
    host.remove();
  };
}

// Meet can change rooms without loading a new document. A room change flushes
// the old tab backup and creates a separate log for the destination room.
let currentRoom = null;
let stopRoom = null;
function followRoom() {
  const room = roomFromPath(location.pathname);
  if (room === currentRoom) return;
  if (stopRoom) stopRoom();
  currentRoom = room;
  stopRoom = room ? startRoom(room) : null;
}
followRoom();
setInterval(followRoom, 1000);
