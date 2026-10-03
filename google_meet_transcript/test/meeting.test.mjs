import assert from "node:assert/strict";
import test from "node:test";
import { isLeaveLabel, isEndedHeading, roomFromPath } from "../src/meeting.js";
import { exportFilename } from "../src/transcript.js";

test("leave controls match supported locales without matching other meeting actions", () => {
  for (const label of ["Leave call", "Leave call (Ctrl + Alt + H)", "会議から退出", "通話から退出", "통화 나가기"]) {
    assert.equal(isLeaveLabel(label), true, label);
  }
  for (const label of ["Turn off captions", "Leave feedback", "End presentation", "参加", "Resume capture"]) {
    assert.equal(isLeaveLabel(label), false, label);
  }
});

test("completed-call headings match English, Japanese, and Korean", () => {
  for (const label of ["You left the meeting", "You've left the meeting", "The meeting has ended", "You've been removed from the meeting", "会議から退出しました", "この会議は終了しました", "회의가 종료되었습니다"]) {
    assert.equal(isEndedHeading(label), true, label);
  }
  for (const label of ["Ready to join?", "Meeting details", "The meeting has ended tomorrow?", "I think the meeting has ended"]) {
    assert.equal(isEndedHeading(label), false, label);
  }
});

test("only meeting-room paths activate capture, and final filenames are distinguishable", () => {
  assert.equal(roomFromPath("/abc-defg-hij"), "abc-defg-hij");
  assert.equal(roomFromPath("/"), null);
  assert.equal(roomFromPath("/landing"), null);
  assert.match(exportFilename("abc-defg-hij", "txt", 0, true), /-final\.txt$/);
  assert.doesNotMatch(exportFilename("abc-defg-hij", "txt", 0), /-final/);
});
