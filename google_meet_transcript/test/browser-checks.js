const storageKey = "google-meet-transcript:v1:abc-defg-hij";
const results = JSON.parse(sessionStorage.getItem("test:checks") || "[]");
const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const panel = () => document.getElementById("google-meet-transcript-panel")?.shadowRoot;
const control = (id) => panel().getElementById(id);
const saved = () => JSON.parse(sessionStorage.getItem(storageKey));
const meetLanguage = () => document.getElementById("meet-spoken-language");
function selectMeetLanguage(value) {
  meetLanguage().value = value;
  meetLanguage().dispatchEvent(new Event("change", { bubbles: true }));
}
const panelBounds = () => document.getElementById("google-meet-transcript-panel").getBoundingClientRect();
const insideWindow = () => {
  const bounds = panelBounds();
  return bounds.left >= 11 && bounds.top >= 11 && bounds.right <= innerWidth - 11 && bounds.bottom <= innerHeight - 11;
};
function dragPanel(dx, dy) {
  const handle = control("move-panel");
  // Synthetic pointers cannot acquire native pointer capture. Test the same
  // down/move/up handlers while bypassing only that browser-owned operation.
  const capture = handle.setPointerCapture;
  handle.setPointerCapture = () => {};
  try {
    for (const [type, x, y] of [["pointerdown", 100, 100], ["pointermove", 100 + dx, 100 + dy], ["pointerup", 100 + dx, 100 + dy]]) {
      handle.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
    }
  } finally {
    handle.setPointerCapture = capture;
  }
}
function check(condition, message) {
  if (!condition) throw new Error(message);
  results.push(message);
}
async function until(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await wait(30);
  }
  throw new Error(`Timed out: ${message}`);
}
async function latestText() {
  const download = window.testState.downloads.at(-1);
  return download.blob.text();
}
function finish(error = null) {
  const output = document.getElementById("results");
  output.dataset.state = error ? "failed" : "passed";
  output.textContent = JSON.stringify({ checks: results, error: error?.stack ?? null });
}

try {
  await until(() => panel(), "panel is installed");
  const phase = sessionStorage.getItem("test:phase");
  if (phase === "closed") {
    check(meetLanguage().value === "en-US", "Closed-tab recovery preserves Meet’s selected language");
    check(control("panel-body").hidden, "Closed-tab recovery starts with the panel collapsed");
    const expected = Number(sessionStorage.getItem("test:expected-count"));
    check(control("status").textContent === `Capturing · ${expected} captions`, "Local recovery restores the log when the previous tab's session storage is gone");
    check(!control("recovery-notice").hidden, "Recovered closed-tab data is identified in the panel");
    await wait(1100);
    check(window.testState.downloads.length === 0 && window.testState.captionClicks === 0,
      "Closed-tab recovery waits for its backup interval and leaves enabled captions on");
    control("download").click();
    check((await latestText()).includes("Final first caption"), "The persistent recovery copy includes evicted captions");

    meetLanguage().hidden = true;
    const languageButton = document.createElement("button");
    languageButton.setAttribute("aria-label", "Meeting language");
    languageButton.textContent = "Japanese";
    let languageClicks = 0;
    languageButton.addEventListener("click", () => { languageClicks += 1; });
    document.body.append(languageButton);
    await until(() => control("recording-label").textContent === "Recording (Japanese)", "custom language control");
    check(languageClicks === 0, "The selected language is read without opening or clicking Meet’s controls");
    languageButton.textContent = "Korean";
    await until(() => control("recording-label").textContent === "Recording (Korean)", "changed custom language control");

    const region = document.getElementById("captions");
    region.replaceChildren();
    history.pushState({}, "", "/klm-nopq-rst");
    region.append(makeCaption("Alex", "A different room"));
    await until(() => control("status").textContent === "Capturing · 1 captions", "room switch");
    check(control("panel-body").hidden && control("collapse").getAttribute("aria-expanded") === "false",
      "A different meeting always starts collapsed");
    check(languageButton.textContent === "Korean" && languageClicks === 0 && control("recording-label").textContent === "Recording (Korean)",
      "Changing rooms keeps Meet’s selected language and updates only the recording status");
    control("download").click();
    check(saved().transcript.entries.length === expected, "Changing rooms preserves the previous room's log without collecting the new room");
    const nextRoom = JSON.parse(sessionStorage.getItem("google-meet-transcript:v1:klm-nopq-rst"));
    check(nextRoom.transcript.entries.length === 1 && nextRoom.transcript.entries[0].text === "A different room", "A different meeting starts capturing into an independent log");
    languageButton.remove();
    await until(() => control("recording-label").textContent === "Recording", "language no longer observable");
    check(control("recording-label").textContent === "Recording", "An unavailable language falls back to Recording without claiming a stale language");
    finish();
  } else if (phase === "reload") {
    check(meetLanguage().value === "en-US" && control("recording-label").textContent === "Recording (English (United States))",
      "Reload uses Meet’s current language instead of a previously stored script default");
    selectMeetLanguage("ja-JP");
    check(control("recording-label").textContent === "Recording (Japanese)", "Changing the language in Meet updates the recording status immediately");
    check(control("panel-body").hidden && control("collapse").getAttribute("aria-expanded") === "false",
      "Reload starts collapsed even when the panel was previously expanded");
    await wait();
    const expectedPosition = JSON.parse(sessionStorage.getItem("test:panel-position"));
    const restoredPosition = panelBounds();
    check(Math.abs(restoredPosition.left - expectedPosition.left) < 1 && Math.abs(restoredPosition.top - expectedPosition.top) < 1,
      "Reload restores the preferred panel position when collapsed");
    control("collapse").click();
    const expected = Number(sessionStorage.getItem("test:expected-count"));
    check(control("status").textContent === `Capturing · ${expected} captions`, "Reload restores the log and resumes capture automatically");
    check(control("auto-finish").checked === false, "The final-download checkbox setting survives reload");
    await wait(1100);
    check(window.testState.downloads.length === 0 && window.testState.captionClicks === 0,
      "Reloading an overdue unsaved log does not immediately download or toggle enabled captions");
    const nextAt = saved().schedule.nextAt;
    check(nextAt > Date.now() + 29 * 60_000 && nextAt <= Date.now() + 30 * 60_000,
      "An overdue restored log gets a fresh 30-minute interval from resumed capture");
    control("download").click();
    check(saved().transcript.entries.length === expected, "Reload does not duplicate the visible tail");
    check((await latestText()).includes("Final first caption"), "Reload retains captions evicted before the refresh");

    sessionStorage.setItem("test:checks", JSON.stringify(results));
    sessionStorage.setItem("test:clear-room-tab", "yes");
    sessionStorage.setItem("test:phase", "closed");
    location.reload();
  } else {
    const captionToggle = document.getElementById("meet-captions-toggle");
    check(control("recording-label").textContent === "Not recording", "Capture waits for Meet's caption controls to be available");
    window.testState.offset += 31 * 60_000;
    await wait(1100);
    check(window.testState.downloads.length === 0 && window.testState.captionClicks === 0,
      "Waiting more than 30 minutes with hidden caption controls does not download or click them");
    captionToggle.disabled = true;
    captionToggle.hidden = false;
    await wait(1100);
    check(window.testState.captionClicks === 0, "Unavailable caption controls are not clicked");
    captionToggle.disabled = false;
    await until(() => control("recording-label").textContent.startsWith("Recording"), "captions enabled automatically");
    check(window.testState.captionClicks === 1 && window.testState.downloads.length === 0,
      "The script turns on Meet captions once without downloading on entry");
    window.testState.offset += 29 * 60_000;
    await wait(1100);
    check(window.testState.downloads.length === 0, "The first backup waits at least 30 minutes after caption capture starts");
    window.testState.offset += 60_000;
    await until(() => window.testState.downloads.length === 1, "first backup after 30 minutes of capture");
    check((await latestText()).includes("First caption"), "The first automatic backup runs after the full capture interval");
    check(control("recording-label").textContent === "Recording (English (United States))",
      "Recording status uses Meet's selected spoken language rather than the translated-caption language");
    check(!control("change-language") && !control("remember-language") && !control("clear-language"),
      "The panel has no language-changing or default-language controls");
    check(meetLanguage().value === "en-US" && window.testState.languageChanges === 0,
      "A legacy script default never changes Meet's selected language");
    selectMeetLanguage("ja-JP");
    check(control("recording-label").textContent === "Recording (Japanese)", "Japanese language labels are displayed as Recording (Japanese)");
    check(control("status").textContent === "Capturing · 1 captions", "Capture starts automatically on an already-loaded page");
    check(control("auto-finish").checked, "Final-download checkbox is enabled by default");
    check(control("panel-body").hidden && control("collapse").getAttribute("aria-expanded") === "false",
      "The panel starts collapsed while capture and its controls remain active");
    await wait();
    const beforeDrag = panelBounds();
    dragPanel(-80, -40);
    const afterDrag = panelBounds();
    check(Math.abs(afterDrag.left - beforeDrag.left + 80) < 1 && Math.abs(afterDrag.top - beforeDrag.top + 40) < 1,
      "Dragging the collapsed panel moves it without expanding it or pausing capture");
    check(control("panel-body").hidden && control("capture").textContent === "Pause", "Dragging leaves the collapse and recording controls unchanged");
    control("move-panel").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true }));
    check(Math.abs(panelBounds().left - afterDrag.left + 1) < 1, "The move handle supports fine keyboard positioning");
    control("reset-position").click();
    check(Math.abs(panelBounds().left - beforeDrag.left) < 1 && Math.abs(panelBounds().top - beforeDrag.top) < 1,
      "Reset panel position restores the default bottom-right placement");
    dragPanel(10000, 10000);
    check(insideWindow(), "Dragging beyond the window keeps the collapsed panel reachable");
    const preferredPosition = panelBounds();
    sessionStorage.setItem("test:panel-position", JSON.stringify({ left: preferredPosition.left, top: preferredPosition.top }));
    control("collapse").click();
    await until(insideWindow, "expanded panel fits the window after resizing");
    check(insideWindow(), "Expanding near the window edge keeps the full panel inside the viewport");
    let region = document.getElementById("captions");
    const first = region.firstElementChild;
    await wait();
    check(control("status").textContent === "Capturing · 1 captions", "Japanese caption region is detected");
    first.lastElementChild.textContent = "Final first caption";
    first.remove();
    region.append(makeCaption("Sam", "Next topic"));
    await wait();
    region.append(makeCaption("Sam", "Yes"), makeCaption("Sam", "Yes"));
    await wait();
    control("download").click();
    check(saved().transcript.entries[0].text === "Final first caption", "A correction made just before row removal is retained");
    check(saved().transcript.entries.length === 4, "Repeated identical utterances remain distinct");
    check(!(await latestText()).includes("Do not collect chat"), "Unrelated chat regions are excluded");

    const replacement = region.cloneNode(true);
    replacement.setAttribute("aria-label", "Captions");
    region.replaceWith(replacement);
    region = replacement;
    await wait();
    control("download").click();
    check(saved().transcript.entries.length === 4, "Re-rendered English caption panels do not duplicate history");
    region.setAttribute("aria-label", "자막");
    region.append(makeCaption("나", "회의를 계속하겠습니다."));
    control("own-name").value = "mlajkim";
    control("own-name").dispatchEvent(new Event("change"));
    await wait();
    control("download").click();
    check((await latestText()).includes("mlajkim\n회의를 계속하겠습니다."), "Korean captions and the optional self-name export correctly");

    const wrapper = document.createElement("section");
    wrapper.append(...region.children);
    region.append(wrapper);
    await wait();
    control("download").click();
    check(saved().transcript.entries.length === 5, "A wrapper around caption rows is not mistaken for a speaker");

    let downloadsBefore = window.testState.downloads.length;
    window.testState.offset += 31 * 60_000;
    await wait(1100);
    check(window.testState.downloads.length === downloadsBefore, "Automatic backup skips an unchanged log after 30 minutes");
    wrapper.append(makeCaption("Alex", "After the first 30 minutes"));
    await until(() => window.testState.downloads.length > downloadsBefore, "first automatic download");
    check(window.testState.downloads.length === downloadsBefore + 1, "Changed captions trigger one automatic backup when due");
    const automaticText = await latestText();
    check(automaticText.includes("Final first caption") && automaticText.includes("After the first 30 minutes"), "Automatic backup contains the full accumulated transcript");
    check(/\.txt$/.test(window.testState.downloads.at(-1).name), "The automatic backup uses the selected file format");

    wrapper.append(makeCaption("Sam", "After a suspended timer"));
    await wait();
    downloadsBefore = window.testState.downloads.length;
    window.testState.offset += 3 * 60 * 60_000;
    await until(() => window.testState.downloads.length > downloadsBefore, "late timer backup");
    await wait(1100);
    check(window.testState.downloads.length === downloadsBefore + 1, "A late timer catches up once instead of creating a burst of downloads");

    control("capture").click();
    check(control("recording-label").textContent === "Not recording", "Pausing removes the Recording (language) status");
    region.hidden = true;
    captionToggle.setAttribute("aria-label", "字幕をオンにする（c）");
    const paused = makeCaption("Alex", "This happened while paused");
    wrapper.append(paused);
    await wait();
    paused.remove();
    await wait();
    control("capture").click();
    await until(() => !region.hidden, "Record enables Japanese caption control");
    check(window.testState.captionClicks === 2, "Record enables captions again using the Japanese Meet control");
    control("download").click();
    check(!(await latestText()).includes("This happened while paused"), "Pause stops collecting caption changes");

    region.hidden = true;
    captionToggle.setAttribute("aria-label", "자막 사용 설정(c)");
    await wait(1100);
    check(window.testState.captionClicks === 2, "Turning captions off in Meet is respected until Record is requested again");
    control("capture").click();
    control("capture").click();
    await until(() => !region.hidden, "Record enables Korean caption control");
    check(window.testState.captionClicks === 3, "Record enables captions using the Korean Meet control");

    control("format").value = "md";
    wrapper.append(makeCaption("Sam", "<script>alert(1)</script> **literal**"));
    await wait();
    control("download").click();
    check((await latestText()).includes("\\<script\\>"), "Markdown exports escape caption markup");
    control("format").value = "json";
    control("download").click();
    check(JSON.parse(await latestText()).entries.length === 8, "JSON exports include all structured entries");
    control("format").value = "txt";
    control("download").click();

    wrapper.append(makeCaption("Alex", "Closing remarks"));
    await wait();
    downloadsBefore = window.testState.downloads.length;
    document.dispatchEvent(new Event("visibilitychange"));
    check(window.testState.downloads.length === downloadsBefore, "Switching tab visibility only saves recovery and does not trigger a final download");
    const unloading = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unloading);
    check(!unloading.defaultPrevented && window.testState.confirmations === 0, "The exit handler never requests a confirmation or cancels navigation");
    check(window.testState.downloads.length === downloadsBefore + 1, "Closing/navigation hook requests a final download of unsaved changes");
    check((await latestText()).includes("Closing remarks") && (await latestText()).includes("Final first caption"), "The final download includes both the remaining captions and the full history");
    check(/-final\.txt$/.test(window.testState.downloads.at(-1).name), "Final downloads have a distinguishable filename");
    window.dispatchEvent(new Event("pagehide"));
    check(window.testState.downloads.length === downloadsBefore + 1, "Repeated exit events do not download the same log twice");

    control("auto-finish").checked = false;
    control("auto-finish").dispatchEvent(new Event("change"));
    wrapper.append(makeCaption("Sam", "Still here after cancelled navigation"));
    await wait();
    downloadsBefore = window.testState.downloads.length;
    window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    window.dispatchEvent(new Event("pagehide"));
    check(window.testState.downloads.length === downloadsBefore, "Disabling the checkbox suppresses final downloads on page exit");
    check(JSON.parse(localStorage.getItem(storageKey)).transcript.entries.at(-1).text === "Still here after cancelled navigation", "Persistent recovery is saved even when final downloads are disabled");

    const ended = document.createElement("h1");
    ended.textContent = "회의가 종료되었습니다";
    document.body.append(ended);
    await wait();
    check(control("status").textContent.startsWith("Finished") && window.testState.downloads.length === downloadsBefore, "A meeting-ended screen respects the disabled final-download checkbox");
    ended.remove();
    await wait();
    check(control("status").textContent.startsWith("Capturing"), "Rejoining the meeting resumes capture automatically");

    control("auto-finish").checked = true;
    control("auto-finish").dispatchEvent(new Event("change"));
    wrapper.append(makeCaption("Alex", "One last sentence before leaving"));
    await wait();
    const leave = document.createElement("button");
    leave.setAttribute("aria-label", "Leave call");
    leave.textContent = "Leave";
    leave.addEventListener("click", () => {
      region.remove();
      ended.textContent = "You left the meeting";
      document.body.append(ended);
    });
    document.body.append(leave);
    leave.click();
    await wait();
    check(window.testState.downloads.length === downloadsBefore + 1 && (await latestText()).includes("One last sentence before leaving"), "Leave call downloads immediately before Meet removes its caption panel");
    check(control("status").textContent.startsWith("Finished"), "Leaving marks the log finished without duplicate downloads");
    leave.remove();
    ended.remove();
    document.body.append(region);
    await wait();
    wrapper.append(makeCaption("Sam", "Final sentence before host ends the call"));
    await wait();
    downloadsBefore = window.testState.downloads.length;
    region.remove();
    ended.textContent = "この会議は終了しました";
    document.body.append(ended);
    await wait();
    check(window.testState.downloads.length === downloadsBefore + 1 && (await latestText()).includes("Final sentence before host ends the call"), "A host-ended meeting requests the final download without a Leave click");
    check(window.testState.confirmations === 0, "Automatic start and finish never open a script confirmation");

    ended.remove();
    document.body.append(region);
    await wait();
    control("auto-finish").checked = false;
    control("auto-finish").dispatchEvent(new Event("change"));
    control("download").click();
    const count = saved().transcript.entries.length;
    const visible = [...wrapper.children].map((entry) => ({
      speaker: entry.firstElementChild.textContent,
      text: entry.lastElementChild.textContent,
    }));
    sessionStorage.setItem("test:visible", JSON.stringify(visible));
    sessionStorage.setItem("test:checks", JSON.stringify(results));
    sessionStorage.setItem("test:expected-count", String(count));
    sessionStorage.setItem("test:offset", String(window.testState.offset));
    sessionStorage.setItem("test:phase", "reload");
    location.reload();
  }
} catch (error) {
  finish(error);
}
