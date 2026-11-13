const LANGUAGE_LABEL = /(?:spoken|meeting|captions?|subtitles?)\s+language|字幕の?言語|会議の言語|音声言語|話されている言語|자막\s*언어|회의\s*언어|음성\s*언어|사용\s*언어/iu;
const TRANSLATED_LABEL = /translat|翻訳|번역/iu;
const LANGUAGE_CONTROLS = 'select, [role="combobox"], button, [role="button"]';

function languageText(node) {
  return (node?.innerText ?? node?.textContent ?? "").replace(/\s+/gu, " ").trim();
}

function languageVisible(node) {
  return !node.closest('[hidden], [aria-hidden="true"]') && node.getClientRects().length > 0;
}

function languageControlName(node) {
  const labelled = (node.getAttribute("aria-labelledby") || "").split(/\s+/u)
    .map((id) => languageText(node.ownerDocument.getElementById(id))).join(" ");
  return [node.getAttribute("aria-label"), labelled,
    ...[...(node.labels || [])].map(languageText)].filter(Boolean).join(" ") || languageText(node);
}

function captionLanguageKey(label) {
  const text = label.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  // Match across Meet's English, Japanese, and Korean interfaces. Preserve
  // regional variants and other languages instead of guessing a locale.
  if (/^(?:japanese|日本語|일본어|ja(?:-jp)?)$/u.test(text)) return "ja";
  if (/^(?:korean|한국어|韓国語|ko(?:-kr)?)$/u.test(text)) return "ko";
  if (/^(?:english|英語|영어|en)$/u.test(text)) return "en";
  if (/^(?:english\s*\(united states\)|英語\s*\(米国\)|영어\s*\(미국\)|en-us)$/u.test(text)) return "en-us";
  if (/^(?:english\s*\(united kingdom\)|英語\s*\(イギリス\)|영어\s*\(영국\)|en-gb)$/u.test(text)) return "en-gb";
  return text;
}

export function captionLanguageName(label) {
  const names = { ja: "Japanese", ko: "Korean", en: "English",
    "en-us": "English (United States)", "en-gb": "English (United Kingdom)" };
  return names[captionLanguageKey(label)] || label;
}

function languageValue(control) {
  if (control.tagName === "SELECT") return languageText(control.selectedOptions[0]);
  const selected = control.querySelector('[aria-selected="true"], [aria-checked="true"]');
  let label = control.getAttribute("aria-valuetext") || languageText(selected) || languageText(control);
  if (!label || label === languageControlName(control)) label = label || languageControlName(control);
  label = label.replace(LANGUAGE_LABEL, "").replace(/^[\s:：-]+|[\s:：-]+$/gu, "");
  return label && label.length <= 120 ? label : "";
}

export function readCaptionLanguage(document) {
  const controls = [...document.querySelectorAll(LANGUAGE_CONTROLS)]
    .filter((node) => languageVisible(node) && !node.disabled && node.getAttribute("aria-disabled") !== "true");
  const control = controls.find((node) => LANGUAGE_LABEL.test(languageControlName(node)) &&
    !TRANSLATED_LABEL.test(languageControlName(node))) || controls.find((node) => {
    // Some Meet versions put a language-only button in the caption toolbar.
    const region = node.closest('[role="region"][aria-label], [role="log"][aria-label]');
    return region && /caption|subtitle|字幕|자막/iu.test(region.getAttribute("aria-label")) &&
      /^(?:ja|ko|en|en-us|en-gb)$/u.test(captionLanguageKey(languageText(node)));
  });
  if (!control) return null;
  const label = languageValue(control);
  return label ? captionLanguageName(label) : null;
}
