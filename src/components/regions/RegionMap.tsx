"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { MAP_FRAME, panBy, sameBox, viewBoxOf, zoomBy, type Box } from "@/lib/domain/mapFrame";
import { Button } from "@/components/ui/primitives";
import s from "./regions.module.css";

type Point = { x: number; y: number };

/**
 * The map's window. The server draws the countries and chooses the opening
 * view (`fit`); this only moves the viewBox, so the map is framed correctly
 * before any script runs and stays usable without one.
 */
export function RegionMap({ world, fit, label, children }: { world: Box; fit: Box; label: string; children: ReactNode }) {
  const [view, setView] = useState<Box>(fit);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const travelled = useRef(0);
  const fitsRecords = !sameBox(fit, world);
  const atFit = sameBox(view, fit);
  const atWorld = sameBox(view, world);

  /** Map units per CSS pixel: the viewBox is fitted inside the element, so the tighter side decides. */
  const unitsPerPixel = useCallback(() => {
    const r = svg.current?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? Math.max(view.width / r.width, view.height / r.height) : 1;
  }, [view.width, view.height]);

  /** Where a client point sits in the current view, as a share of it. */
  const shareAt = useCallback(
    (p: Point) => {
      const r = svg.current?.getBoundingClientRect();
      if (!r) return { x: 0.5, y: 0.5 };
      const u = unitsPerPixel();
      const x = (p.x - r.left - (r.width - view.width / u) / 2) / (view.width / u);
      const y = (p.y - r.top - (r.height - view.height / u) / 2) / (view.height / u);
      return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    },
    [unitsPerPixel, view.width, view.height],
  );

  // Trackpad pinch (ctrl + wheel) zooms; a plain wheel still scrolls the page.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setView((v) => zoomBy(v, Math.exp(-e.deltaY / 240), world, shareAt({ x: e.clientX, y: e.clientY })));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [world, shareAt]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (pointers.current.size === 0) travelled.current = 0;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const before = pointers.current.get(e.pointerId);
    if (!before) return;
    const now = { x: e.clientX, y: e.clientY };
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    pointers.current.set(e.pointerId, now);
    const u = unitsPerPixel();
    if (others.length === 0) {
      travelled.current += Math.abs(now.x - before.x) + Math.abs(now.y - before.y);
      // Hold the pointer once it is clearly a drag, so the pan continues outside the map.
      if (travelled.current > 6 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
      setView((v) => panBy(v, (before.x - now.x) * u, (before.y - now.y) * u, world));
      return;
    }
    // Two fingers: the spread zooms about their midpoint, and the midpoint's travel pans.
    const other = others[0];
    const spread = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const from = middle(before, other);
    const to = middle(now, other);
    travelled.current += 8;
    setView((v) => panBy(zoomBy(v, spread(now, other) / spread(before, other), world, shareAt(to)), (from.x - to.x) * u, (from.y - to.y) * u, world));
  };

  const onPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = view.width / 6;
    const moves: Record<string, () => Box> = {
      ArrowLeft: () => panBy(view, -step, 0, world),
      ArrowRight: () => panBy(view, step, 0, world),
      ArrowUp: () => panBy(view, 0, -step, world),
      ArrowDown: () => panBy(view, 0, step, world),
      "+": () => zoomBy(view, MAP_FRAME.zoomStep, world),
      "=": () => zoomBy(view, MAP_FRAME.zoomStep, world),
      "-": () => zoomBy(view, 1 / MAP_FRAME.zoomStep, world),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setView(move());
  };

  const status = atFit ? (fitsRecords ? "Your records" : "Whole world") : atWorld ? "Whole world" : "Your view";

  return (
    <div className={s.mapFrame}>
      <div className={s.mapBar}>
        <span className="eyebrow" aria-live="polite">
          {status}
        </span>
        <div className={s.mapTools}>
          {!atFit && (
            <Button variant="ghost" size="small" onClick={() => setView(fit)}>
              {fitsRecords ? "Your records" : "Reset"}
            </Button>
          )}
          {fitsRecords && atFit && (
            <Button variant="ghost" size="small" onClick={() => setView(world)}>
              Whole world
            </Button>
          )}
          <Button variant="secondary" icon="minus" iconOnly aria-label="Zoom out" disabled={view.width >= world.width - 0.5 || view.height >= world.height - 0.5} onClick={() => setView((v) => zoomBy(v, 1 / MAP_FRAME.zoomStep, world))} />
          <Button variant="secondary" icon="plus" iconOnly aria-label="Zoom in" disabled={view.width <= world.width / MAP_FRAME.maxZoom + 0.5} onClick={() => setView((v) => zoomBy(v, MAP_FRAME.zoomStep, world))} />
        </div>
      </div>
      <svg
        ref={svg}
        className={s.map}
        // On a phone the map's box follows the view's shape, between a 4:3 plate and the world's own strip.
        style={{ "--map-shape": Math.min(world.width / world.height, Math.max(4 / 3, view.width / view.height)) } as CSSProperties}
        viewBox={viewBoxOf(view)}
        role="group"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        // A drag that ends over a country must not follow its link.
        onClickCapture={(e) => {
          if (travelled.current > 6) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <rect x={world.x} y={world.y} width={world.width} height={world.height} className={s.sea} aria-hidden="true" />
        {children}
      </svg>
    </div>
  );
}
