import assert from "node:assert/strict";
import test from "node:test";
import { fitPanelPosition } from "../src/panel-position.js";

test("a position saved on a larger screen keeps the whole panel inside a smaller window", () => {
  const position = fitPanelPosition({ left: 1600, top: 900 }, { width: 292, height: 76 }, { width: 800, height: 600 });
  assert.deepEqual(position, { left: 496, top: 512 });
});

test("expanding near the bottom edge keeps controls visible without losing the preferred position", () => {
  const preferred = { left: 320, top: 500 };
  const viewport = { width: 800, height: 600 };
  assert.deepEqual(fitPanelPosition(preferred, { width: 292, height: 76 }, viewport), preferred);
  assert.deepEqual(fitPanelPosition(preferred, { width: 292, height: 500 }, viewport), { left: 320, top: 88 });
  assert.deepEqual(preferred, { left: 320, top: 500 });
});

test("dragging beyond the top or left edge leaves the panel reachable", () => {
  assert.deepEqual(fitPanelPosition({ left: -100, top: -200 }, { width: 292, height: 76 }, { width: 800, height: 600 }),
    { left: 12, top: 12 });
});
