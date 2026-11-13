const PANEL_POSITION_KEY = "google-meet-transcript:panel-position:v1";
const PANEL_MARGIN = 12;

export function fitPanelPosition(position, size, viewport) {
  return {
    left: Math.max(PANEL_MARGIN, Math.min(position.left, viewport.width - size.width - PANEL_MARGIN)),
    top: Math.max(PANEL_MARGIN, Math.min(position.top, viewport.height - size.height - PANEL_MARGIN)),
  };
}

export function makePanelMovable(host, handle) {
  let position = null;
  let drag = null;
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_POSITION_KEY));
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) position = saved;
  } catch { /* Position preferences must not prevent caption capture. */ }

  function fit(candidate) {
    return fitPanelPosition(candidate, host.getBoundingClientRect(), {
      width: window.innerWidth, height: window.innerHeight,
    });
  }

  function place() {
    const size = host.getBoundingClientRect();
    const next = fit(position || {
      left: window.innerWidth - size.width - 18,
      top: window.innerHeight - size.height - 88,
    });
    Object.assign(host.style, {
      left: `${next.left}px`, top: `${next.top}px`, right: "auto", bottom: "auto",
    });
  }

  function save() {
    try {
      localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(position));
    } catch { /* Moving still works when persistent storage is unavailable. */ }
  }

  function start(event) {
    if (event.button !== 0 || !event.isPrimary || drag) return;
    handle.setPointerCapture(event.pointerId);
    const bounds = host.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
    handle.classList.add("dragging");
    event.preventDefault();
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    position = fit({ left: drag.left + event.clientX - drag.x, top: drag.top + event.clientY - drag.y });
    place();
  }

  function end(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    handle.classList.remove("dragging");
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    save();
  }

  function keydown(event) {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const bounds = host.getBoundingClientRect();
    const step = event.shiftKey ? 1 : 10;
    position = fit({ left: bounds.left + direction[0] * step, top: bounds.top + direction[1] * step });
    place();
    save();
  }

  const listeners = { pointerdown: start, pointermove: move, pointerup: end, pointercancel: end,
    lostpointercapture: end, keydown };
  for (const [type, listener] of Object.entries(listeners)) handle.addEventListener(type, listener);
  const observer = new ResizeObserver(place);
  observer.observe(host);
  window.addEventListener("resize", place);
  place();

  return {
    refresh: place,
    reset() {
      position = null;
      place();
      save();
    },
    destroy() {
      for (const [type, listener] of Object.entries(listeners)) handle.removeEventListener(type, listener);
      if (drag && handle.hasPointerCapture(drag.id)) handle.releasePointerCapture(drag.id);
      observer.disconnect();
      window.removeEventListener("resize", place);
    },
  };
}
