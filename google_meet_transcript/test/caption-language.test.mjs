import test from "node:test";
import assert from "node:assert/strict";
import { captionLanguageName } from "../src/caption-language.js";

test("recording status names supported languages in English and preserves other names and regions", () => {
  for (const label of ["Japanese", "日本語", "일본어", "ja-JP"]) {
    assert.equal(captionLanguageName(label), "Japanese");
  }
  for (const label of ["Korean", "한국어", "韓国語"]) {
    assert.equal(captionLanguageName(label), "Korean");
  }
  assert.equal(captionLanguageName("英語（米国）"), "English (United States)");
  assert.equal(captionLanguageName("English (United Kingdom)"), "English (United Kingdom)");
  assert.equal(captionLanguageName("Português (Brasil)"), "Português (Brasil)");
});
