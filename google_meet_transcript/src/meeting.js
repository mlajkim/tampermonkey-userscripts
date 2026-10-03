import { cleanText } from "./transcript.js";

const LEAVE_CONTROL = /^(?:leave (?:the )?(?:call|meeting)|(?:通話|会議|ミーティング)(?:から退出|を退出)|退出|(?:통화|회의)\s*나가기|나가기)(?:\s*\([^)]*\))?$/iu;
const ENDED_HEADING = /^(?:you(?:['’]ve| have)? left (?:the )?(?:meeting|call)|(?:this |the )?meeting has ended|you(?:['’]ve| have) been removed from (?:the )?meeting|you were removed from (?:the )?meeting|(?:この)?(?:通話|会議|ミーティング)(?:から退出しました|を退出しました|(?:は|が)終了しました|から削除されました)|(?:회의|통화)(?:에서 (?:나왔습니다|나갔습니다|퇴장되었습니다)|가 종료되었습니다))[.!。！]?$/iu;

export function roomFromPath(path) {
  return path.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:\/|$)/iu)?.[1] || null;
}

export function isLeaveLabel(label) {
  return LEAVE_CONTROL.test(cleanText(label));
}

export function isEndedHeading(text) {
  return ENDED_HEADING.test(cleanText(text));
}

export function clickedLeaveControl(event) {
  const path = event.composedPath();
  return path.some((node) => node.matches?.('button, [role="button"]') &&
    isLeaveLabel(node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent));
}

export function meetingHasEnded(document) {
  return [...document.querySelectorAll('h1, h2, [role="heading"], [role="alert"]')]
    .some((node) => !node.closest('[hidden], [aria-hidden="true"], [role="region"], [role="log"]') &&
      node.getClientRects().length > 0 && isEndedHeading(node.innerText));
}
