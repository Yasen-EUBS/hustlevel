import { describe, expect, it } from "vitest";
import { buildSegments, DEFAULTS, snapshot, type TimerState } from "@/lib/timers";

const state = (type: TimerState["type"], cfg: any, startedAt: number): TimerState => ({
  type, cfg, segments: buildSegments(type, cfg), startedAt, accumulated: 0, rounds: 0, laps: [], finished: false, lastIndex: 0,
});

describe("timers", () => {
  it("tabata defaults to 20s work / 10s rest x 8", () => {
    expect(DEFAULTS.tabata).toEqual({ work: 20, rest: 10, rounds: 8 });
    const segs = buildSegments("tabata", DEFAULTS.tabata);
    expect(segs.filter((s) => s.phase === "work")).toHaveLength(8);
  });
  it("non-rest timers get a 3s countdown, rest timer does not", () => {
    expect(buildSegments("emom", DEFAULTS.emom)[0]).toMatchObject({ phase: "ready", dur: 3 });
    expect(buildSegments("rest", DEFAULTS.rest)[0]?.phase).toBe("rest");
  });
  it("EMOM defaults to 60s intervals", () => {
    expect(DEFAULTS.emom.interval).toBe(60);
  });
  it("uses wall-clock deltas, so time is correct after a long gap", () => {
    const s = state("emom", { minutes: 10, interval: 60 }, 0);
    const snap = snapshot(s, (3 + 125) * 1000); // prep + 2m05s
    expect(snap.segment?.round).toBe(3);
    expect(snap.display).toBe(55);
  });
});
