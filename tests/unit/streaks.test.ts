import { describe, expect, it } from "vitest";
import { reachedMilestone, streak } from "@/lib/streaks";

const days = (s: string) => [...s].map((c) => c === "+");

describe("streak", () => {
  it("рахує поспіль від найсвіжішого дня", () => {
    expect(streak(days("+++-++")).days).toBe(3);
  });
  it("один зрив після тижня «заморожується»", () => {
    expect(streak(days("+++++++-+++"))).toEqual({ days: 10, freezesUsed: 1 });
  });
  it("зрив у перший тиждень обриває серію", () => {
    expect(streak(days("++-++++")).days).toBe(2);
  });
  it("два зриви підряд після тижня — кінець", () => {
    expect(streak(days("+++++++--+++")).days).toBe(7);
  });
  it("рубежі", () => {
    expect(reachedMilestone(6, 7)).toBe(7);
    expect(reachedMilestone(7, 8)).toBeNull();
  });
});
