const storageKey = "google-meet-transcript:v1:abc-defg-hij";
const results = JSON.parse(sessionStorage.getItem("test:checks") || "[]");
const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const panel = () => document.getElementById("google-meet-transcript-panel")?.shadowRoot;
const control = (id) => panel().getElementById(id);
const saved = () => JSON.parse(sessionStorage.getItem(storageKey));
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
    const expected = Number(sessionStorage.getItem("test:expected-count"));
    check(control("status").textContent === `Capturing · ${expected} captions`, "Local recovery restores the log when the previous tab's session storage is gone");
    check(!control("recovery-notice").hidden, "Recovered closed-tab data is identified in the panel");
    control("download").click();
    check((await latestText()).includes("Final first caption"), "The persistent recovery copy includes evicted captions");

    const region = document.getElementById("captions");
    region.replaceChildren();
    history.pushState({}, "", "/klm-nopq-rst");
    region.append(makeCaption("Alex", "A different room"));
    await until(() => control("status").textContent === "Capturing · 1 captions", "room switch");
    control("download").click();
    check(saved().transcript.entries.length === expected, "Changing rooms preserves the previous room's log without collecting the new room");
    const nextRoom = JSON.parse(sessionStorage.getItem("google-meet-transcript:v1:klm-nopq-rst"));
    check(nextRoom.transcript.entries.length === 1 && nextRoom.transcript.entries[0].text === "A different room", "A different meeting starts capturing into an independent log");
    finish();
  } else if (phase === "reload") {
    const expected = Number(sessionStorage.getItem("test:expected-count"));
    check(control("status").textContent === `Capturing · ${expected} captions`, "Reload restores the log and resumes capture automatically");
    check(control("auto-finish").checked === false, "The final-download checkbox setting survives reload");
    await wait();
    control("download").click();
    check(saved().transcript.entries.length === expected, "Reload does not duplicate the visible tail");
    check((await latestText()).includes("Final first caption"), "Reload retains captions evicted before the refresh");

    sessionStorage.setItem("test:checks", JSON.stringify(results));
    sessionStorage.setItem("test:clear-room-tab", "yes");
    sessionStorage.setItem("test:phase", "closed");
    location.reload();
  } else {
    check(control("status").textContent === "Capturing · 1 captions", "Capture starts automatically on an already-loaded page");
    check(control("auto-finish").checked, "Final-download checkbox is enabled by default");
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
    const paused = makeCaption("Alex", "This happened while paused");
    wrapper.append(paused);
    await wait();
    paused.remove();
    await wait();
    control("capture").click();
    control("download").click();
    check(!(await latestText()).includes("This happened while paused"), "Pause stops collecting caption changes");

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
