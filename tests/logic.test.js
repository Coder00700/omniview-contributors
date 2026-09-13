import test from "node:test";
import assert from "node:assert/strict";
import { alignmentReminder, canFit, clock, CAP } from "../src/logic.js";
test("alignment waits 25 seconds and prevents repeated interruptions for 60 seconds", () => {
  let state = alignmentReminder({
    bad: true,
    now: 1000,
    badSince: null,
    lastHint: 0,
  });
  assert.equal(state.show, false);
  state = alignmentReminder({ ...state, bad: true, now: 26000 });
  assert.equal(state.show, false);
  state = alignmentReminder({ ...state, bad: true, now: 60000 });
  assert.equal(state.show, true);
  state = alignmentReminder({ ...state, bad: true, now: 85000 });
  assert.equal(state.show, false);
  state = alignmentReminder({ ...state, bad: false, now: 90000 });
  assert.equal(state.badSince, null);
  state = alignmentReminder({ ...state, bad: true, now: 120000 });
  assert.equal(state.show, false);
  state = alignmentReminder({ ...state, bad: true, now: 145000 });
  assert.equal(state.show, true);
});
test("storage cap preserves pending recordings", () => {
  assert.equal(canFit(CAP - 100, 100), true);
  assert.equal(canFit(CAP - 100, 101), false);
});
test("recording clock handles both supported limits", () => {
  assert.equal(clock(180), "03:00");
  assert.equal(clock(300), "05:00");
  assert.equal(clock(65.9), "01:05");
});
