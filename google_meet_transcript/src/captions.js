import { cleanText } from "./transcript.js";

const CAPTION_LABEL = /\b(?:captions?|subtitles?|transcripts?)\b|字幕|文字起こし|자막|스크립트/iu;
const ENABLE_CAPTIONS = /^(?:turn on captions|字幕をオンにする|자막 (?:사용|사용 설정|켜기))$/iu;
const DISABLE_CAPTIONS = /^(?:turn off captions|字幕をオフにする|자막 (?:사용 안함|사용 중지|끄기))$/iu;
const CAPTION_TOGGLE = /^(?:captions|字幕|자막)$/iu;

function textOf(element) {
  return cleanText(element?.innerText ?? element?.textContent ?? "");
}

function hidden(element) {
  return Boolean(element.closest('[hidden], [aria-hidden="true"]')) ||
    (element.isConnected && element.getClientRects().length === 0);
}

// Use accessibility labels to locate the caption panel, rather than Meet's
// generated CSS class names. Keep all DOM assumptions in this small adapter.
export function captionRegions(document) {
  return [...document.querySelectorAll('[role="region"][aria-label], [role="log"][aria-label]')]
    .filter((element) => CAPTION_LABEL.test(element.getAttribute("aria-label")) && !hidden(element))
    .filter((element, _, regions) => !regions.some((parent) => parent !== element && parent.contains(element)));
}

// Meet's toolbar is authoritative even while its caption panel is catching up.
// A visible panel is a read-only fallback when the toolbar is not recognized.
export function readMeetCaptions(document) {
  for (const control of document.querySelectorAll('button, [role="button"]')) {
    if (hidden(control)) continue;
    const label = cleanText(control.getAttribute("aria-label") || control.getAttribute("title") || textOf(control))
      .replace(/\s*[（(][^()（）]*[）)]\s*$/u, "");
    const onAction = ENABLE_CAPTIONS.test(label);
    const offAction = DISABLE_CAPTIONS.test(label);
    if (!onAction && !offAction && !CAPTION_TOGGLE.test(label)) continue;
    const pressed = control.getAttribute("aria-pressed") ?? control.getAttribute("aria-checked");
    const enabled = pressed === "true" ? true : pressed === "false" ? false : offAction ? true : onAction ? false : null;
    if (enabled === null) continue;
    return { enabled, control, available: !control.disabled && control.getAttribute("aria-disabled") !== "true" };
  }
  return { enabled: captionRegions(document).length ? true : null, control: null, available: false };
}

// Request a change through Meet, without predicting whether the click worked.
export function setMeetCaptions(document, enabled) {
  const current = readMeetCaptions(document);
  if (current.enabled === enabled) return true;
  if (!current.available) return false;
  current.control.click();
  return true;
}

export function readCaptionRow(element) {
  if (element.matches('button, input, select, textarea, [role="button"]') || hidden(element)) return null;
  const parts = [...element.children].filter((child) => !hidden(child));
  if (parts.length < 2) return null;

  const heading = parts[0];
  const label = heading.querySelector('[data-speaker-name], [data-participant-name], span') || heading;
  const speaker = textOf(label);
  // An outer wrapper with several caption rows must not become one big row.
  if (!speaker || speaker.length > 160 || textOf(heading) !== speaker) return null;
  if (parts.slice(1).some((part) => part.querySelector('button, input, select, [role="button"]'))) return null;
  const text = parts.slice(1).map(textOf).filter(Boolean).join(" ");
  return text ? { key: element, speaker, text } : null;
}

export function captionRows(regions) {
  const rows = [];
  function visit(element, depth) {
    if (depth > 6 || hidden(element)) return;
    const row = readCaptionRow(element);
    if (row) {
      rows.push(row);
      return;
    }
    for (const child of element.children) visit(child, depth + 1);
  }
  for (const region of regions) {
    for (const child of region.children) visit(child, 0);
  }
  return rows;
}
