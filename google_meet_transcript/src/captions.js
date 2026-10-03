import { cleanText } from "./transcript.js";

const CAPTION_LABEL = /\b(?:captions?|subtitles?|transcripts?)\b|字幕|文字起こし|자막|스크립트/iu;

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
