import "server-only";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, Polygon } from "geojson";
import world from "world-atlas/countries-110m.json";
import type { Box } from "@/lib/domain/mapFrame";

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 470;
export const MAP_WORLD: Box = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };

/**
 * A country's distant territories are drawn but do not steer the framing:
 * only landmasses at least this share of its largest one count. France is
 * framed on Europe rather than stretched to French Guiana, while both main
 * islands of New Zealand stay in.
 */
const MAINLAND_SHARE = 0.25;

type CountryShape = { id: string; name: string; d: string; frame: Box };
let cache: CountryShape[] | null = null;

/** Country outlines from Natural Earth 1:110m (via world-atlas), projected once per process. */
export function countryShapes(): CountryShape[] {
  if (cache) return cache;
  const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  const features = fc.features.filter((f) => f.properties.name !== "Antarctica");
  const projection = geoEqualEarth().fitExtent(
    [
      [4, 4],
      [MAP_WIDTH - 4, MAP_HEIGHT - 4],
    ],
    { type: "FeatureCollection", features } as FeatureCollection,
  );
  const path = geoPath(projection);
  const boxOf = (g: Geometry): Box => {
    const [[x0, y0], [x1, y1]] = path.bounds(g);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  };
  const mainland = (g: Geometry): Box => {
    if (g.type !== "MultiPolygon") return boxOf(g);
    const parts = g.coordinates.map((coordinates) => {
      const polygon: Polygon = { type: "Polygon", coordinates };
      return { area: path.area(polygon), box: boxOf(polygon) };
    });
    const largest = Math.max(...parts.map((p) => p.area));
    const kept = parts.filter((p) => p.area >= largest * MAINLAND_SHARE).map((p) => p.box);
    const x = Math.min(...kept.map((b) => b.x));
    const y = Math.min(...kept.map((b) => b.y));
    return { x, y, width: Math.max(...kept.map((b) => b.x + b.width)) - x, height: Math.max(...kept.map((b) => b.y + b.height)) - y };
  };
  cache = features.map((f: Feature<Geometry, { name: string }>) => ({ id: String(f.id), name: f.properties.name, d: path(f) ?? "", frame: mainland(f.geometry) }));
  return cache;
}
