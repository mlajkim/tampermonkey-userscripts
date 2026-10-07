const results = [];
const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
const panel = () => document.getElementById("google-meet-auto-video-off-panel").shadowRoot;
const status = () => panel().getElementById("status").textContent;
const toggle = () => panel().getElementById("toggle").click();
const applyAgain = () => panel().getElementById("retry").click();
const countOff = (id) => testState.off.filter((value) => value === id).length;
function check(condition, message) {
  if (!condition) throw new Error(message);
  results.push(message);
}
async function until(predicate, message, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait();
  }
  throw new Error(`Timed out: ${message}; status: ${status()}`);
}
const idle = () => !document.querySelector('[role="menu"]:not(#inactive-menu)') && !panel().getElementById("retry").disabled;
const done = () => status().startsWith("Done · ") && idle();

try {
  let requiresTrustedHTML = false;
  try { document.createElement("div").innerHTML = "<span>test</span>"; }
  catch (error) { requiresTrustedHTML = error instanceof TypeError; }
  check(requiresTrustedHTML && !!panel(), "The userscript panel starts when the page enforces Trusted Types");
  await wait(1000);
  check(testState.menus.length === 0 && status() === "Waiting for a call", "Pre-join screens do not trigger camera actions");
  makeParticipant("canvas", { tile: true, idAttribute: "data-requested-participant-id", iconOnly: true });
  makeParticipant("jp", { language: "ja" });
  makeParticipant("kr", { language: "ko" });
  makeParticipant("same-name-1", { name: "Test participant" });
  makeParticipant("same-name-2", { name: "Test participant" });
  makeParticipant("already-off", { off: true });
  makeParticipant("rejected", { rejectOff: true });
  makeParticipant("menu-share", { menuPresentation: true });
  join();
  await until(done, "the initial camera-off pass", 15000);
  check(testState.peopleOpens === 1 && countOff("participant-a") === 1 && !participants.get("participant-a").watching,
    "Joining automatically opens People and turns off a camera without participant-ID attributes or video elements");
  check(document.getElementById("people-toggle").textContent === "People3",
    "A People button with a separate count is recognized without an aria-label");
  check(document.getElementById("reaction-tray").isConnected,
    "A Send a reaction dialog can remain open while camera automation runs");
  check(document.getElementById("inactive-menu").isConnected,
    "A transparent inactive menu does not block camera automation");
  check(testState.menus.filter((id) => id === "participant-a").length === 2,
    "Success requires reopening the native menu and verifying Start watching");
  check(!testState.menus.some((id) => ["self", "named-self", "share", "shared-video"].includes(id)),
    "Self-view, shared screens, and shared videos are excluded from camera actions");
  check(document.querySelectorAll("video").length === 0, "Camera discovery works without any video elements");

  check(countOff("canvas") === 1, "Canvas tiles using data-requested-participant-id and icon-only menu buttons are supported");
  check(countOff("jp") === 1 && countOff("kr") === 1, "Japanese and Korean camera controls are supported in the initial pass");
  check(countOff("same-name-1") === 1 && countOff("same-name-2") === 1, "Participants with identical names are both handled");
  check(testState.menus.includes("already-off") && countOff("already-off") === 0 && !testState.on.includes("already-off"),
    "An already-disabled camera is never turned back on");
  check(participants.get("rejected").watching && status().includes("Unconfirmed: 2"),
    "A rejected native action and an unsupported presentation menu are reported as unconfirmed");
  check(testState.menus.includes("menu-share") && countOff("menu-share") === 0,
    "Presentation controls in a menu prevent a video-off click even without a tile marker");

  const menuCountAfterDone = testState.menus.length;
  makeParticipant("late");
  await wait(6500);
  check(countOff("late") === 0 && !testState.menus.includes("late"), "Participants arriving after Done are left alone");
  check(countOff("rejected") === 1 && testState.menus.length === menuCountAfterDone,
    "A completed pass does not reopen menus or retry failed camera actions");
  check(done() && panel().getElementById("toggle").disabled, "Done persists and Pause/Resume cannot restart a completed pass");
  participants.get("rejected").remove();
  participants.get("menu-share").remove();

  const participantA = participants.get("participant-a");
  participantA.more.click();
  await until(() => [...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent.includes("Start watching")), "manual restore menu");
  [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.includes("Start watching")).click();
  await wait(1200);
  check(countOff("participant-a") === 1 && participantA.watching, "A manually restored camera is left on for the rest of that join");
  participantA.remove();
  makeParticipant("participant-a", { language: "watch" });
  await wait(1000);
  check(countOff("participant-a") === 1, "Replacing an ID-less People row preserves its unique-name override");

  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.textContent = "Your settings";
  document.body.append(dialog);
  makeParticipant("after-dialog");
  applyAgain();
  await wait(2500);
  check(countOff("after-dialog") === 0 && dialog.isConnected, "An unrelated dialog blocks automation and remains untouched");
  toggle();
  dialog.remove();
  makeParticipant("paused");
  await wait(1100);
  check(countOff("paused") === 0 && status() === "Paused", "Pause stops camera actions for new participants");
  toggle();
  await until(done, "resumed pass", 10000);
  check(countOff("after-dialog") === 1 && countOff("paused") === 1, "Resume finishes the pass after a dialog or pause");
  check(countOff("late") === 1 && countOff("participant-a") === 2, "Apply again explicitly starts a new pass over current participants");

  makeParticipant("leaving", { delay: 1200 });
  applyAgain();
  await until(() => testState.menus.includes("leaving"), "menu before leaving", 10000);
  document.getElementById("leave").click();
  await wait(1500);
  check(countOff("leaving") === 0, "Leaving cancels an in-flight camera action");
  participants.get("leaving").remove();
  participants.get("participant-a").remove();
  makeParticipant("participant-a", { language: "watch" });
  join();
  await until(() => countOff("participant-a") === 3 && done(), "same-room rejoin", 12000);
  check(true, "Rejoining the same meeting runs one new camera-off pass");

  applyAgain();
  toggle();
  document.getElementById("participants").replaceChildren();
  document.getElementById("tiles").replaceChildren();
  document.getElementById("people").hidden = true;
  history.pushState({}, "", "/klm-nopq-rst");
  makeParticipant("new-room");
  await until(() => countOff("new-room") === 1 && done(), "new room", 8000);
  check(panel().getElementById("toggle").textContent === "Pause", "A new room starts with camera automation enabled");

  // Only one row is mounted at a time, as in a virtualized People list.
  const list = document.getElementById("participants");
  list.replaceChildren();
  list.style.cssText = "position:relative;height:90px;overflow-y:auto;width:400px";
  const spacer = document.createElement("div");
  spacer.style.height = "800px";
  list.append(spacer);
  let mountedIndex = -1;
  function renderVisibleParticipant() {
    const index = Math.min(7, Math.floor(list.scrollTop / 100));
    if (index === mountedIndex) return;
    list.querySelector('[role="listitem"]')?.remove();
    mountedIndex = index;
    const id = `virtual-${index}`;
    const row = makeParticipant(id, { idAttribute: "data-participant-id", off: countOff(id) > 0 });
    row.style.cssText = `position:absolute;top:${index * 100}px;left:0;right:0;height:80px;box-sizing:border-box;margin:0`;
  }
  list.addEventListener("scroll", renderVisibleParticipant);
  // --dump-dom advances timers faster than compositor scroll events. Keep the
  // simulated virtual list synchronized with the actual DOM scroll position.
  const virtualizationTimer = setInterval(renderVisibleParticipant, 50);
  list.scrollTop = 230;
  renderVisibleParticipant();
  history.pushState({}, "", "/uvw-xyza-bcd");
  await until(() => Array.from({ length: 8 }, (_, index) => countOff(`virtual-${index}`)).every((count) => count === 1) && done(),
    "all virtualized participants", 25000);
  await until(() => list.scrollTop === 230, "restoring the People scroll position");
  clearInterval(virtualizationTimer);
  list.removeEventListener("scroll", renderVisibleParticipant);
  check(true, "A virtualized People list is scanned from top to bottom so off-screen cameras are turned off");
  check(list.scrollTop === 230, "The automatic scan restores the original People-list scroll position");

  list.replaceChildren();
  list.style.cssText = "";
  history.pushState({}, "", "/efg-hijk-lmn");
  await until(() => done() && status() === "Done · Camera feeds off: 0", "an empty call");
  check(status() === "Done · Camera feeds off: 0", "An empty call finishes its pass without waiting indefinitely");
  makeParticipant("after-empty");
  await wait(1100);
  check(countOff("after-empty") === 0 && !testState.menus.includes("after-empty"), "An empty completed pass does not restart when a participant arrives");
  check(testState.unexpected.length === 0 && testState.on.join(",") === "participant-a",
    "The script never changes Audio only, outgoing cameras, mute/remove controls, or shared-content feeds");

  const output = document.getElementById("results");
  output.dataset.state = "passed";
  output.textContent = JSON.stringify({ checks: results, error: null });
} catch (error) {
  const output = document.getElementById("results");
  output.dataset.state = "failed";
  const list = document.getElementById("participants");
  const diagnostic = { scrollTop: list.scrollTop, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
    overflow: getComputedStyle(list).overflowY, visibleRows: [...list.querySelectorAll('[data-participant-id]')].map((row) => row.dataset.participantId),
    off: testState.off, menus: testState.menus.slice(-8) };
  output.textContent = JSON.stringify({ checks: results, error: `${error.stack}\nFixture: ${JSON.stringify(diagnostic)}` });
}
