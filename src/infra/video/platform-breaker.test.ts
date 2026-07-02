import { beforeEach, describe, expect, it } from "vitest";

import { isOpen, recordOutcome, resetForTest, setClock, successRate } from "./platform-breaker.js";

const PLATFORM = "tiktok";

describe("platform-breaker", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("stays closed (not open) below MIN_SAMPLES even with all failures", () => {
    recordOutcome(PLATFORM, false);
    recordOutcome(PLATFORM, false);
    recordOutcome(PLATFORM, false);
    expect(isOpen(PLATFORM)).toBe(false);
  });

  it("opens when the windowed failure rate crosses the threshold with enough samples", () => {
    // 5 samples, 4 failures / 1 success = 80% failure rate >= 70% threshold
    recordOutcome(PLATFORM, false);
    recordOutcome(PLATFORM, false);
    recordOutcome(PLATFORM, false);
    recordOutcome(PLATFORM, false);
    recordOutcome(PLATFORM, true);
    expect(isOpen(PLATFORM)).toBe(true);
  });

  it("does not open when failure rate stays below the threshold", () => {
    // 5 samples, 2 failures / 3 successes = 40% failure rate < 70% threshold
    recordOutcome(PLATFORM, true);
    recordOutcome(PLATFORM, true);
    recordOutcome(PLATFORM, true);
    recordOutcome(PLATFORM, false);
    recordOutcome(PLATFORM, false);
    expect(isOpen(PLATFORM)).toBe(false);
  });

  it("blocks (isOpen true) while open, and repeated checks do not reset the timer", () => {
    let t = 0;
    setClock(() => t);
    for (let i = 0; i < 5; i++) recordOutcome(PLATFORM, false);
    expect(isOpen(PLATFORM)).toBe(true);

    t += 1000; // still well within cooldown
    expect(isOpen(PLATFORM)).toBe(true);
  });

  it("transitions to half_open after the cooldown window elapses (isOpen returns false to allow a trial)", () => {
    let t = 0;
    setClock(() => t);
    for (let i = 0; i < 5; i++) recordOutcome(PLATFORM, false);
    expect(isOpen(PLATFORM)).toBe(true);

    t += 5 * 60_000; // exactly COOLDOWN_MS
    expect(isOpen(PLATFORM)).toBe(false); // half-open: allow a trial attempt
  });

  it("closes on a successful half-open trial", () => {
    let t = 0;
    setClock(() => t);
    for (let i = 0; i < 5; i++) recordOutcome(PLATFORM, false);
    t += 5 * 60_000;
    expect(isOpen(PLATFORM)).toBe(false); // now half_open

    recordOutcome(PLATFORM, true); // trial succeeds
    expect(isOpen(PLATFORM)).toBe(false);

    // Confirm it's genuinely closed, not just still mid-cooldown: a single
    // failure now should NOT reopen it (needs MIN_SAMPLES again).
    recordOutcome(PLATFORM, false);
    expect(isOpen(PLATFORM)).toBe(false);
  });

  it("re-opens (with a fresh cooldown) on a failed half-open trial", () => {
    let t = 0;
    setClock(() => t);
    for (let i = 0; i < 5; i++) recordOutcome(PLATFORM, false);
    t += 5 * 60_000;
    expect(isOpen(PLATFORM)).toBe(false); // half_open

    recordOutcome(PLATFORM, false); // trial fails
    expect(isOpen(PLATFORM)).toBe(true);

    // Cooldown timer reset — advancing only 1s should not half-open again.
    t += 1000;
    expect(isOpen(PLATFORM)).toBe(true);

    t += 5 * 60_000;
    expect(isOpen(PLATFORM)).toBe(false);
  });

  it("successRate returns the windowed success fraction", () => {
    recordOutcome(PLATFORM, true);
    recordOutcome(PLATFORM, true);
    recordOutcome(PLATFORM, false);
    recordOutcome(PLATFORM, true);
    expect(successRate(PLATFORM)).toBeCloseTo(0.75);
  });

  it("successRate is 0 for a platform with no recorded outcomes", () => {
    expect(successRate("youtube")).toBe(0);
  });

  it("tracks platforms independently", () => {
    for (let i = 0; i < 5; i++) recordOutcome("instagram", false);
    expect(isOpen("instagram")).toBe(true);
    expect(isOpen("youtube")).toBe(false);
  });
});
