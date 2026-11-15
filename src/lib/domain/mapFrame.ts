/**
 * Framing for the Regions map. Pure geometry in the map's own projected units,
 * so the server can choose the opening view and the browser can pan and zoom
 * with the same rules. Nothing here reads or changes journal data.
 */
export type Box = { x: number; y: number; width: number; height: number };

export const MAP_FRAME = {
  /** Breathing room around the recorded places, as a share of their longer side. */
  padRatio: 0.16,
  /** Never less padding than this, so a coastline is not cut at the edge. */
  minPad: 16,
  /** The closest the opening view gets: one small country still shows its neighbours. */
  minFitShare: 0.22,
  /** Records spread across most of the world's width get the whole world, not a near-miss crop. */
  wholeWorldShare: 0.86,
  /** Manual zoom stops here: beyond it the 1:110m outlines are only a few points. */
  maxZoom: 12,
  /** One step of the zoom buttons or keys. */
  zoomStep: 1.6,
} as const;

const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;

/** The smallest box containing every given box, or null when there are none. */
export function union(boxes: Box[]): Box | null {
  const real = boxes.filter((b) => Number.isFinite(b.x + b.y + b.width + b.height) && b.width >= 0 && b.height >= 0);
  if (real.length === 0) return null;
  const x = Math.min(...real.map((b) => b.x));
  const y = Math.min(...real.map((b) => b.y));
  return { x, y, width: Math.max(...real.map(right)) - x, height: Math.max(...real.map(bottom)) - y };
}

/** Moves (and if needed shrinks) a box so it lies inside the world. */
export function clampToWorld(box: Box, world: Box): Box {
  const width = Math.min(box.width, world.width);
  const height = Math.min(box.height, world.height);
  const x = Math.min(Math.max(box.x, world.x), right(world) - width);
  const y = Math.min(Math.max(box.y, world.y), bottom(world) - height);
  return { x, y, width, height };
}

const grownTo = (box: Box, width: number, height: number): Box => ({
  x: box.x - (width - box.width) / 2,
  y: box.y - (height - box.height) / 2,
  width,
  height,
});

/**
 * The opening view: the recorded places with padding around them.
 * No places gives the whole world. A tight cluster is held back to a minimum
 * size so it keeps its surroundings; a spread across most of the world's width
 * becomes the whole world. A tall, narrow spread (the length of the Americas)
 * keeps its own width and is simply as tall as the world.
 */
export function frameFor(places: Box[], world: Box): Box {
  const bounds = union(places);
  if (!bounds) return world;
  const pad = Math.max(MAP_FRAME.minPad, MAP_FRAME.padRatio * Math.max(bounds.width, bounds.height));
  let frame = grownTo(bounds, bounds.width + 2 * pad, bounds.height + 2 * pad);
  frame = grownTo(frame, Math.max(frame.width, world.width * MAP_FRAME.minFitShare), Math.max(frame.height, world.height * MAP_FRAME.minFitShare));
  if (frame.width >= world.width * MAP_FRAME.wholeWorldShare) return world;
  return clampToWorld(frame, world);
}

/** Zooms about a point given as a share (0–1) of the current view; factor > 1 zooms in. */
export function zoomBy(view: Box, factor: number, world: Box, at: { x: number; y: number } = { x: 0.5, y: 0.5 }): Box {
  const smallest = world.width / MAP_FRAME.maxZoom;
  // Hold the view's own shape while it fits; the widest view is the largest box of that shape inside the world.
  const largest = Math.min(world.width, (world.height * view.width) / view.height);
  const width = Math.min(Math.max(view.width / factor, Math.min(smallest, view.width)), Math.max(largest, view.width));
  const height = (width * view.height) / view.width;
  const fx = view.x + view.width * at.x;
  const fy = view.y + view.height * at.y;
  return clampToWorld({ x: fx - width * at.x, y: fy - height * at.y, width, height }, world);
}

/** Pans by a distance in map units, stopping at the edge of the world. */
export function panBy(view: Box, dx: number, dy: number, world: Box): Box {
  return clampToWorld({ ...view, x: view.x + dx, y: view.y + dy }, world);
}

export function sameBox(a: Box, b: Box, tolerance = 0.5): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance && Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
}

export const viewBoxOf = (b: Box) => `${round(b.x)} ${round(b.y)} ${round(b.width)} ${round(b.height)}`;
const round = (n: number) => Math.round(n * 100) / 100;
