import { describe, expect, it } from "vitest";
import { getContainedRect } from "../src/lib/imageGeometry";

describe("image overlay geometry", () => {
  it("fits a wide image into a taller container with vertical letterboxing", () => {
    const rect = getContainedRect({ width: 1000, height: 800 }, { width: 4624, height: 3472 });
    expect(rect?.left).toBeCloseTo(0);
    expect(rect?.width).toBeCloseTo(1000);
    expect(rect?.height).toBeCloseTo(750.865, 3);
    expect(rect?.top).toBeCloseTo(24.567, 3);
  });

  it("fits a wide image into a narrow mobile container with vertical letterboxing", () => {
    const rect = getContainedRect({ width: 613, height: 344.8125 }, { width: 4624, height: 3472 });
    expect(rect?.left).toBeCloseTo(76.89, 2);
    expect(rect?.top).toBeCloseTo(0);
    expect(rect?.width).toBeCloseTo(459.22, 2);
    expect(rect?.height).toBeCloseTo(344.8125);
  });

  it("returns null for invalid geometry", () => {
    expect(getContainedRect({ width: 0, height: 100 }, { width: 100, height: 100 })).toBeNull();
  });
});
