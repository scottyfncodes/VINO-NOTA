import "server-only";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import world from "world-atlas/countries-110m.json";

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 470;

type CountryShape = { id: string; name: string; d: string };
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
  cache = features.map((f: Feature<Geometry, { name: string }>) => ({ id: String(f.id), name: f.properties.name, d: path(f) ?? "" }));
  return cache;
}
