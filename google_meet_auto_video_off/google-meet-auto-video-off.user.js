// ==UserScript==
// @name         Google Meet Auto Video Off
// @namespace    https://github.com/mlajkim/tampermonkey-userscripts
// @version      0.2.1
// @description  Save bandwidth by turning off participants' camera feeds on join, while keeping shared content visible.
// @author       mlajkim
// @match        https://meet.google.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  "use strict";
  const PANEL_ID = "google-meet-auto-video-off-panel";
  if (document.getElementById(PANEL_ID)) return;
  const BUTTON = 'button, [role="button"]';
  const TILE = '[data-participant-id], [data-requested-participant-id], [data-participantid]';
  const ROW = `${TILE}, [role="listitem"]`;
  const ICON = 'i, .google-symbols, .material-icons, .material-symbols-outlined, [data-icon-name]';
  const LEAVE = /^(?:leave (?:the )?(?:call|meeting)|(?:通話|会議|ミーティング)(?:から退出|を退出|を終了)|退出|(?:통화|회의)\s*(?:나가기|종료)|나가기)$/iu;
  const MORE = /^(?:more (?:options|actions)(?: for .+)?|その他(?:のオプション|の操作)?|詳細オプション|더보기|옵션 더보기|추가 옵션)$/iu;
  const PEOPLE = /^(?:people|participants|show everyone|everyone|参加者(?:を表示)?|全員を表示|ユーザー|참여자|참석자|모든 사용자(?: 보기)?|사용자)$/iu;
  const REACTION_TRAY = /^(?:send a reaction|リアクションを送信|반응 보내기)$/iu;
  const OFF = /^(?:turn off (?:their )?video|don['’]t watch|do not watch|stop watching|(?:動画|映像|ビデオ)をオフ(?:にする)?|(?:動画|映像)を表示しない|視聴を停止(?:する)?|(?:동영상|영상|비디오)\s*(?:끄기|사용 중지)|시청 중지)$/iu;
  const ON = /^(?:turn on (?:their )?video|start watching|watch|(?:動画|映像|ビデオ)をオン(?:にする)?|視聴を開始(?:する)?|(?:동영상|영상|비디오)\s*(?:켜기|사용|사용 설정)|시청 시작)$/iu;
  const SELF_MARKER = '[data-self-name], [data-is-self="true"], [data-is-local="true"]';
  const SHARE_MARKER = '[data-presentation-id], [data-is-presentation="true"], [data-is-screen-share="true"]';
  const SELF_LABEL = /(?:^(?:you|your video|あなた|自分|나|내 동영상)$|[（(](?:you|あなた|自分|나|본인)[)）])/iu;
  const SHARE_LABEL = /present(?:ation|ing)|screen\s*shar|shared screen|画面(?:を)?共有|共有画面|プレゼンテーション|発表中|화면\s*공유|발표\s*중|프레젠테이션/iu;
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (text) => (text || "").replace(/\s+/gu, " ").trim();
  const visible = (node) => node?.isConnected && !node.closest('[hidden], [aria-hidden="true"]') &&
    [...node.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0) &&
    (node.checkVisibility ? node.checkVisibility({ opacityProperty: true, visibilityProperty: true }) :
      getComputedStyle(node).visibility !== "hidden");
  const usable = (node) => !node.disabled && node.getAttribute("aria-disabled") !== "true";
  const roomPath = () => location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:\/|$)/iu)?.[1] || null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function textWithoutControls(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll(`${ICON}, ${BUTTON}, [aria-hidden="true"], [hidden]`).forEach((part) => part.remove());
    return clean(copy.textContent);
  }
  function names(node) {
    const labelledBy = (node.getAttribute("aria-labelledby") || "").split(/\s+/u)
      .map((id) => document.getElementById(id)?.textContent || "").join(" ");
    return [node.getAttribute("aria-label"), node.getAttribute("title"), node.getAttribute("data-tooltip"),
      labelledBy, textWithoutControls(node)].map(clean).filter(Boolean);
  }
  const matches = (node, pattern) => names(node).some((text) => pattern.test(text) ||
    pattern.test(text.replace(/\s*[（(][^）)]*[）)]$/u, "").trim()));
  const hasIcon = (node, name) => all(ICON, node).some((icon) =>
    clean(icon.textContent) === name || icon.getAttribute("data-icon-name") === name);
  const isMore = (node) => usable(node) && (matches(node, MORE) || hasIcon(node, "more_vert"));
  const leaveControl = () => all(BUTTON).find((node) => visible(node) && usable(node) &&
    (matches(node, LEAVE) || hasIcon(node, "call_end")));
  const menus = () => all('[role="menu"]').filter(visible);

  function peopleControl() {
    return all(BUTTON).find((node) => visible(node) && usable(node) && !node.closest(ROW) &&
      (matches(node, PEOPLE) || hasIcon(node, "people") || hasIcon(node, "group") ||
        // Current Meet uses a div button with separate People and count spans ("People5").
        (node.getAttribute("aria-haspopup") === "dialog" && all('span', node).some((label) =>
          !label.childElementCount && PEOPLE.test(clean(label.textContent))))));
  }
  function peoplePanel() {
    const button = peopleControl();
    const id = button?.getAttribute("aria-controls") || button?.getAttribute("aria-owns");
    const controlled = id && document.getElementById(id);
    if (controlled && visible(controlled)) return controlled;
    const labelled = all('[aria-label], [role="complementary"], aside').find((node) =>
      !node.matches(BUTTON) && visible(node) && PEOPLE.test(clean(node.getAttribute("aria-label"))));
    if (labelled) return labelled;
    for (const heading of all('h1, h2, h3, [role="heading"]')) {
      if (!visible(heading) || !matches(heading, PEOPLE)) continue;
      for (let parent = heading.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (parent.contains(leaveControl())) break;
        if (all(ROW, parent).length) return parent;
      }
    }
    return null;
  }
  function excluded(row) {
    if (row.closest(SELF_MARKER) || row.querySelector(SELF_MARKER) ||
        row.closest(SHARE_MARKER) || row.querySelector(SHARE_MARKER)) return true;
    const id = row.getAttribute("data-participant-id") || row.getAttribute("data-requested-participant-id") || "";
    if (/(?:^|[/:_-])(?:presentation|screenshare|screen-share)(?:$|[/:_-])/iu.test(id)) return true;
    const descriptions = [row.getAttribute("aria-label"), row.innerText,
      ...all('[aria-label]', row).map((node) => node.getAttribute("aria-label"))];
    return descriptions.some((text) => (text || "").split(/\n/u).some((line) =>
      SELF_LABEL.test(clean(line)) || SHARE_LABEL.test(clean(line)))) ||
      ["present_to_all", "screen_share"].some((icon) => hasIcon(row, icon));
  }

  // A video element is not required: Meet can render canvas tiles or only a People row.
  const nodeKeys = new WeakMap();
  let serial = 0;
  function nodeKey(node) {
    if (!nodeKeys.has(node)) nodeKeys.set(node, `node:${++serial}`);
    return nodeKeys.get(node);
  }
  function candidates() {
    const panel = peoplePanel();
    const controls = new Set();
    if (panel) all(BUTTON, panel).filter(isMore).forEach((node) => controls.add(node));
    for (const tile of all(TILE).filter(visible)) {
      all(BUTTON, tile).filter(isMore).forEach((node) => controls.add(node));
    }
    const result = [];
    for (const more of controls) {
      let row = more.closest(ROW);
      if (!row && panel?.contains(more)) {
        for (let parent = more.parentElement; parent && parent !== panel; parent = parent.parentElement) {
          if (all(BUTTON, parent).filter(isMore).length !== 1) break;
          if (textWithoutControls(parent)) { row = parent; break; }
        }
      }
      if (!row || !visible(row) || excluded(row)) continue;
      const id = row.getAttribute("data-participant-id") || row.getAttribute("data-requested-participant-id") || row.getAttribute("data-participantid");
      const name = row.querySelector('[data-participant-name]')?.textContent ||
        (row.innerText || "").split(/\n/u).map(clean).find((line) => line && !MORE.test(line) && line !== "more_vert");
      const key = id ? `id:${id}` : name ? `name:${clean(name)}` : nodeKey(row);
      result.push({ key, row, more });
    }
    // Duplicate display names must not cause one person's camera to be skipped.
    for (const item of result) {
      if (item.key.startsWith("name:") && result.some((other) => other !== item && other.key === item.key && other.row !== item.row)) {
        item.duplicateName = true;
      }
    }
    for (const item of result) if (item.duplicateName) item.key = nodeKey(item.row);
    return result;
  }

  const host = document.createElement("div");
  host.id = PANEL_ID;
  const ui = host.attachShadow({ mode: "open" });
  // Build the panel without an HTML sink so pages enforcing Trusted Types can run it.
  const style = document.createElement("style");
  style.textContent = `
      :host { all: initial; position: fixed; left: 18px; bottom: 88px; z-index: 2147483000;
        font: 12px/1.5 system-ui, sans-serif; color: #e8eaed; }
      section { padding: 10px 12px; max-width: 310px; border: 1px solid #5f6368;
        border-radius: 10px; background: #202124; box-shadow: 0 2px 10px #0005; }
      header { display: flex; align-items: center; gap: 10px; }
      strong { font-size: 13px; }
      button { border: 1px solid #8ab4f8; border-radius: 6px; background: transparent;
        color: #8ab4f8; padding: 3px 8px; cursor: pointer; font: inherit; }
      button:disabled { opacity: .5; cursor: default; }
      p { margin: 5px 0 0; color: #bdc1c6; }
      :host([hidden]) { display: none; }`;
  function element(tag, text, attributes = {}) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }
  const section = element("section", "", { "aria-label": "Auto video off" });
  const header = element("header");
  const title = element("strong", "Auto video off ");
  title.append(element("small", "v0.2.1"));
  header.append(title, element("button", "Pause", { id: "toggle", type: "button" }),
    element("button", "Apply again", { id: "retry", type: "button" }));
  section.append(header, element("p", "Waiting for a call", { id: "status", role: "status", "aria-live": "polite" }));
  ui.append(style, section);
  document.body.append(host);
  const status = ui.getElementById("status");
  const toggle = ui.getElementById("toggle");
  const retry = ui.getElementById("retry");
  const newSession = (room) => ({ room, joined: false, enabled: true, peopleRequested: false,
    absentSince: null, handled: new Set(), attempts: new Map(), errors: new Set(), phase: "",
    scan: null, scanDone: false, scanWaitUntil: 0 });
  let session = newSession(roomPath());
  let busy = false;
  let generation = 0;
  let quietUntil = 0;
  function render() {
    host.hidden = !session.room;
    const message = !session.joined ? "Waiting for a call" : !session.enabled ? "Paused" : session.phase ||
      (session.handled.size || session.errors.size ? `Camera feeds off: ${session.handled.size}${session.errors.size ? ` · Unconfirmed: ${session.errors.size}` : ""}` : "Waiting for participant camera controls");
    if (status.textContent !== message) status.textContent = message;
    toggle.textContent = session.enabled ? "Pause" : "Resume";
    retry.disabled = busy || !session.joined;
  }
  function reset() { generation += 1; session = newSession(roomPath()); render(); }
  toggle.addEventListener("click", () => { session.enabled = !session.enabled; generation += 1; render(); });
  retry.addEventListener("click", () => { reset(); quietUntil = 0; tick(); });
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    document.addEventListener(type, (event) => {
      if (!event.isTrusted || event.composedPath().includes(host)) return;
      quietUntil = Date.now() + 2000;
      generation += 1;
      // Manual navigation takes ownership of the People list's scroll position.
      if (event.composedPath().includes(peoplePanel())) {
        session.scan = null;
        session.scanDone = true;
      }
    }, { capture: true, passive: true });
  }
  document.addEventListener("click", (event) => {
    if (event.composedPath().some((node) => node.matches?.(BUTTON) &&
        (matches(node, LEAVE) || hasIcon(node, "call_end")))) reset();
  }, true);

  function scanPeople(panel) {
    if (!panel || session.scanDone) return false;
    if (!session.scan) {
      const scroller = [panel, ...all('*', panel)].find((node) => visible(node) &&
        node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 2 &&
        /^(?:auto|scroll)$/u.test(getComputedStyle(node).overflowY));
      if (!scroller) return false;
      session.scan = { node: scroller, original: scroller.scrollTop, passes: 0 };
      scroller.scrollTop = 0;
    } else {
      const { node, original } = session.scan;
      const end = node.scrollHeight - node.clientHeight;
      if (!node.isConnected || node.scrollTop >= end - 2 || session.scan.passes >= 200) {
        if (node.isConnected) node.scrollTop = original;
        session.scan = null;
        session.scanDone = true;
        return false;
      }
      // Overlap rows so virtualization cannot omit a participant at the viewport edge.
      node.scrollTop = Math.min(end, node.scrollTop + Math.max(1, Math.floor(node.clientHeight * 0.7)));
      session.scan.passes += 1;
    }
    session.scanWaitUntil = Date.now() + 700;
    return true;
  }

  async function turnOff(target) {
    busy = true;
    const state = session;
    const epoch = generation;
    let menu = null;
    const valid = () => session === state && generation === epoch && state.enabled && state.joined &&
      roomPath() === state.room && !document.hidden && leaveControl();
    const targetKey = target.key;
    const previous = state.attempts.get(targetKey);
    state.attempts.set(targetKey, { count: (previous?.count || 0) + 1, time: Date.now() });
    const refresh = () => candidates().find((item) => item.key === targetKey);
    async function waitFor(find) {
      const deadline = Date.now() + 2000;
      do {
        if (!valid()) throw new Error("Interrupted");
        const found = find();
        if (found) return found;
        await sleep(100);
      } while (Date.now() < deadline);
      throw new Error("Unconfirmed");
    }
    async function openMenu() {
      target = refresh();
      if (!target || excluded(target.row) || menus().length) throw new Error("Unconfirmed");
      target.more.click();
      menu = await waitFor(() => {
        const open = menus();
        const id = target.more.getAttribute("aria-controls") || target.more.getAttribute("aria-owns");
        const expected = id && document.getElementById(id);
        return open.length === 1 && (!expected || open[0] === expected) ? open[0] : null;
      });
      return waitFor(() => {
        const items = all('[role="menuitem"], [role="menuitemcheckbox"], button', menu).filter((node) => visible(node) && usable(node));
        if (items.some((node) => matches(node, SHARE_LABEL))) throw new Error("Shared content");
        const off = items.find((node) => matches(node, OFF));
        const on = items.find((node) => matches(node, ON));
        return off || on ? { off, on } : null;
      });
    }
    try {
      state.phase = "Turning off camera feeds…";
      render();
      const action = await openMenu();
      if (action.off) {
        if (!valid()) throw new Error("Interrupted");
        action.off.click();
        await waitFor(() => !visible(menu));
        // Confirm the native menu now offers Start watching, rather than counting a click as success.
        const confirmation = await openMenu();
        if (!confirmation.on || confirmation.off) throw new Error("Unconfirmed");
      }
      state.handled.add(targetKey);
      state.errors.delete(targetKey);
    } catch (error) {
      if (session === state) {
        if (error.message === "Interrupted") {
          if (previous) state.attempts.set(targetKey, previous);
          else state.attempts.delete(targetKey);
        } else state.errors.add(targetKey);
      }
    } finally {
      if (menu && visible(menu) && generation === epoch && session === state) {
        menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      }
      state.phase = "";
      busy = false;
      render();
    }
  }

  function tick() {
    if (roomPath() !== session.room) reset();
    if (!session.room || document.hidden) return;
    if (!leaveControl()) {
      if (session.joined) {
        session.absentSince ??= Date.now();
        if (Date.now() - session.absentSince >= 3000) reset();
      }
      render();
      return;
    }
    session.joined = true;
    session.absentSince = null;
    if (!session.enabled || busy || Date.now() < Math.max(quietUntil, session.scanWaitUntil)) { render(); return; }
    const panel = peoplePanel();
    if (menus().length || all('[role="dialog"]').some((node) => visible(node) && node !== panel && !node.contains(panel) &&
        !(node.getAttribute("aria-modal") !== "true" && matches(node, REACTION_TRAY)))) {
      session.phase = "Waiting for the open Meet menu or dialog to close";
      render();
      return;
    }
    session.phase = "";
    // Open People once per join. It provides camera controls even for off-screen and canvas tiles.
    if (!session.peopleRequested) {
      if (panel) session.peopleRequested = true;
      else {
        const people = peopleControl();
        if (people) {
          people.click();
          session.peopleRequested = true;
          render();
          return;
        }
      }
    }
    const target = candidates().find((item) => {
      if (session.handled.has(item.key)) return false;
      const attempt = session.attempts.get(item.key);
      return !attempt || (attempt.count < 2 && Date.now() - attempt.time >= 6000);
    });
    if (target) void turnOff(target);
    else scanPeople(panel);
    render();
  }
  setInterval(tick, 500);
  tick();
})();
