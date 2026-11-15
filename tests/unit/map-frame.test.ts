import { describe, expect, it } from "vitest";
import { clampToWorld, frameFor, MAP_FRAME, panBy, sameBox, union, zoomBy, type Box } from "@/lib/domain/mapFrame";

const WORLD: Box = { x: 0, y: 0, width: 960, height: 470 };
const inside = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.width <= WORLD.width + 1e-6 && b.y + b.height <= WORLD.height + 1e-6;
const contains = (outer: Box, inner: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

// Rough projected positions, enough to exercise the rules.
const france: Box = { x: 470, y: 118, width: 22, height: 20 };
const germany: Box = { x: 492, y: 104, width: 18, height: 20 };
const italy: Box = { x: 496, y: 124, width: 22, height: 26 };
const hungary: Box = { x: 520, y: 120, width: 14, height: 7 };
const argentina: Box = { x: 290, y: 330, width: 34, height: 90 };
const newZealand: Box = { x: 900, y: 370, width: 28, height: 36 };

describe("frameFor", () => {
  it("shows the whole world when nothing is recorded", () => {
    expect(frameFor([], WORLD)).toEqual(WORLD);
  });

  it("fits a cluster with padding on every side", () => {
    const places = [france, germany, italy];
    const frame = frameFor(places, WORLD);
    const bounds = union(places)!;
    expect(contains(frame, bounds)).toBe(true);
    for (const gap of [bounds.x - frame.x, bounds.y - frame.y, frame.x + frame.width - (bounds.x + bounds.width), frame.y + frame.height - (bounds.y + bounds.height)]) {
      expect(gap).toBeGreaterThanOrEqual(MAP_FRAME.minPad);
    }
    expect(frame.width).toBeLessThan(WORLD.width / 2);
    expect(inside(frame)).toBe(true);
  });

  it("holds a single small country back to the minimum view, centred on it", () => {
    const frame = frameFor([hungary], WORLD);
    expect(frame.width).toBeCloseTo(WORLD.width * MAP_FRAME.minFitShare, 5);
    expect(frame.height).toBeCloseTo(WORLD.height * MAP_FRAME.minFitShare, 5);
    expect(frame.x + frame.width / 2).toBeCloseTo(hungary.x + hungary.width / 2, 5);
    expect(frame.y + frame.height / 2).toBeCloseTo(hungary.y + hungary.height / 2, 5);
  });

  it("gives records spread across the world the whole world", () => {
    expect(frameFor([france, argentina, newZealand], WORLD)).toEqual(WORLD);
  });

  it("never opens on a crop that is nearly the whole world", () => {
    // Europe to New Zealand: wide enough that a fitted frame would differ from the world by a sliver.
    const frame = frameFor([france, newZealand], WORLD);
    expect(frame.width === WORLD.width || frame.width < WORLD.width * MAP_FRAME.wholeWorldShare).toBe(true);
  });

  it("keeps a tall, narrow spread to its own width instead of the whole world", () => {
    const chile: Box = { x: 262, y: 300, width: 16, height: 120 };
    const usa: Box = { x: 150, y: 96, width: 150, height: 60 };
    const frame = frameFor([usa, argentina, chile], WORLD);
    expect(frame.width).toBeLessThan(WORLD.width * 0.5);
    expect(frame.height).toBeLessThanOrEqual(WORLD.height);
    expect(contains(frame, union([usa, argentina, chile])!)).toBe(true);
    expect(inside(frame)).toBe(true);
  });

  it("keeps a frame near the edge inside the world without dropping the place", () => {
    const frame = frameFor([newZealand], WORLD);
    expect(inside(frame)).toBe(true);
    expect(contains(frame, newZealand)).toBe(true);
  });

  it("ignores boxes that are not finite", () => {
    expect(frameFor([{ x: NaN, y: 0, width: 1, height: 1 }], WORLD)).toEqual(WORLD);
  });

  it("is deterministic and does not depend on the order of places", () => {
    expect(frameFor([italy, france, germany], WORLD)).toEqual(frameFor([germany, italy, france], WORLD));
  });
});

describe("manual pan and zoom", () => {
  const fit = frameFor([france, germany, italy], WORLD);

  it("zooms in about the centre and stops at the maximum zoom", () => {
    const once = zoomBy(fit, MAP_FRAME.zoomStep, WORLD);
    expect(once.width).toBeCloseTo(fit.width / MAP_FRAME.zoomStep, 5);
    expect(once.x + once.width / 2).toBeCloseTo(fit.x + fit.width / 2, 5);
    let v = fit;
    for (let i = 0; i < 20; i++) v = zoomBy(v, MAP_FRAME.zoomStep, WORLD);
    expect(v.width).toBeCloseTo(WORLD.width / MAP_FRAME.maxZoom, 5);
  });

  it("zooms out no further than the world and never leaves it", () => {
    let v = fit;
    for (let i = 0; i < 20; i++) v = zoomBy(v, 1 / MAP_FRAME.zoomStep, WORLD);
    expect(inside(v)).toBe(true);
    expect(v.width / v.height).toBeCloseTo(fit.width / fit.height, 5);
    expect(v.width === WORLD.width || Math.abs(v.height - WORLD.height) < 1e-6).toBe(true);
  });

  it("keeps the point under the pointer still while zooming", () => {
    const at = { x: 0.25, y: 0.75 };
    const before = { x: fit.x + fit.width * at.x, y: fit.y + fit.height * at.y };
    const v = zoomBy(fit, 2, WORLD, at);
    expect(v.x + v.width * at.x).toBeCloseTo(before.x, 5);
    expect(v.y + v.height * at.y).toBeCloseTo(before.y, 5);
  });

  it("pans by the given distance and stops at the edge of the world", () => {
    const moved = panBy(fit, 30, -10, WORLD);
    expect(moved.x).toBeCloseTo(fit.x + 30, 5);
    expect(moved.y).toBeCloseTo(fit.y - 10, 5);
    const far = panBy(fit, 5000, 5000, WORLD);
    expect(far.x + far.width).toBeCloseTo(WORLD.width, 5);
    expect(far.y + far.height).toBeCloseTo(WORLD.height, 5);
    expect(far.width).toBe(fit.width);
  });

  it("clamps a box larger than the world to the world", () => {
    expect(clampToWorld({ x: -50, y: -50, width: 2000, height: 900 }, WORLD)).toEqual(WORLD);
  });

  it("compares views with a tolerance", () => {
    expect(sameBox(fit, { ...fit, x: fit.x + 0.2 })).toBe(true);
    expect(sameBox(fit, WORLD)).toBe(false);
  });
});
