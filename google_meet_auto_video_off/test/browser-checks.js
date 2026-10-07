const results = [];
const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
const panel = () => document.getElementById("google-meet-auto-video-off-panel").shadowRoot;
const status = () => panel().getElementById("status").textContent;
const toggle = () => panel().getElementById("toggle").click();
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

try {
  let requiresTrustedHTML = false;
  try { document.createElement("div").innerHTML = "<span>test</span>"; }
  catch (error) { requiresTrustedHTML = error instanceof TypeError; }
  check(requiresTrustedHTML && !!panel(), "The userscript panel starts when the page enforces Trusted Types");
  await wait(1000);
  check(testState.menus.length === 0 && status() === "Waiting for a call", "Pre-join screens do not trigger camera actions");
  join();
  await until(() => status() === "Camera feeds off: 1" && idle(), "camera control in the People list");
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

  makeParticipant("canvas", { tile: true, idAttribute: "data-requested-participant-id", iconOnly: true });
  await until(() => countOff("canvas") === 1 && idle(), "canvas tile");
  check(true, "Canvas tiles using data-requested-participant-id and icon-only menu buttons are supported");
  makeParticipant("jp", { language: "ja" });
  makeParticipant("kr", { language: "ko" });
  await until(() => countOff("jp") === 1 && countOff("kr") === 1 && idle(), "localized late arrivals");
  check(true, "Japanese and Korean camera controls are applied to late arrivals");

  makeParticipant("same-name-1", { name: "Test participant" });
  makeParticipant("same-name-2", { name: "Test participant" });
  await until(() => countOff("same-name-1") === 1 && countOff("same-name-2") === 1 && idle(), "duplicate participant names");
  check(true, "Participants with identical names are both handled");

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

  makeParticipant("already-off", { off: true });
  await until(() => testState.menus.includes("already-off") && idle(), "already disabled feed");
  check(countOff("already-off") === 0 && !testState.on.includes("already-off"), "An already-disabled camera is never turned back on");

  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.textContent = "Your settings";
  document.body.append(dialog);
  makeParticipant("after-dialog");
  await wait(1100);
  check(countOff("after-dialog") === 0 && dialog.isConnected, "An unrelated dialog blocks automation and remains untouched");
  dialog.remove();
  await until(() => countOff("after-dialog") === 1 && idle(), "closed dialog");

  toggle();
  makeParticipant("paused");
  await wait(1100);
  check(countOff("paused") === 0 && status() === "Paused", "Pause stops camera actions for new participants");
  toggle();
  await until(() => countOff("paused") === 1 && idle(), "resumed automation");
  check(true, "Resume processes cameras that appeared while paused");

  makeParticipant("rejected", { rejectOff: true });
  await until(() => status().includes("Unconfirmed: 1") && idle(), "failed native action");
  check(participants.get("rejected").watching, "A native action that does not change the feed is reported as unconfirmed");
  await until(() => countOff("rejected") === 2 && idle(), "second attempt", 8500);
  await wait(6500);
  check(countOff("rejected") === 2, "Failed camera actions stop after two attempts");
  participants.get("rejected").remove();

  makeParticipant("menu-share", { menuPresentation: true });
  await until(() => testState.menus.includes("menu-share") && idle(), "presentation menu guard");
  check(countOff("menu-share") === 0, "Presentation controls in a menu prevent a video-off click even without a tile marker");
  participants.get("menu-share").remove();

  makeParticipant("leaving", { delay: 1200 });
  await until(() => testState.menus.includes("leaving"), "menu before leaving");
  document.getElementById("leave").click();
  await wait(1500);
  check(countOff("leaving") === 0, "Leaving cancels an in-flight camera action");
  participants.get("leaving").remove();
  join();
  await until(() => countOff("participant-a") === 2 && idle(), "same-room rejoin");
  check(true, "Rejoining the same meeting reapplies the camera-off default");

  toggle();
  document.getElementById("participants").replaceChildren();
  document.getElementById("tiles").replaceChildren();
  document.getElementById("people").hidden = true;
  history.pushState({}, "", "/klm-nopq-rst");
  makeParticipant("new-room");
  await until(() => countOff("new-room") === 1 && idle(), "new room");
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
  await until(() => Array.from({ length: 8 }, (_, index) => countOff(`virtual-${index}`)).every((count) => count === 1) && idle(),
    "all virtualized participants", 20000);
  await until(() => list.scrollTop === 230, "restoring the People scroll position");
  clearInterval(virtualizationTimer);
  check(true, "A virtualized People list is scanned from top to bottom so off-screen cameras are turned off");
  check(list.scrollTop === 230, "The automatic scan restores the original People-list scroll position");
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
