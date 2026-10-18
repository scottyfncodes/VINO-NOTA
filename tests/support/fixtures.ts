import { getDb } from "@/server/db";
import { user } from "@/server/db/schema";
import { LocalStorage, setStorageForTesting } from "@/server/storage";
import sharp from "sharp";
import os from "node:os";
import path from "node:path";

export async function createUser(label = "user") {
  const id = `${label}-${crypto.randomUUID()}`;
  await getDb().insert(user).values({ id, name: label, email: `${id}@example.test` });
  return id;
}

export function useTempStorage() {
  const dir = path.join(os.tmpdir(), `vino-storage-${crypto.randomUUID()}`);
  const storage = new LocalStorage(dir);
  setStorageForTesting(storage);
  return { storage, dir };
}

export async function sampleJpeg(width = 900, height = 1200) {
  return sharp({ create: { width, height, channels: 3, background: { r: 114, g: 47, b: 55 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: "TestCam" } } })
    .toBuffer();
}

export const baseWine = {
  name: "Les Pagodes de Cos",
  producer: "Château Cos d'Estournel",
  vintage: 2016,
  isNonVintage: false,
  wineType: "red",
  country: "FR",
  region: "Bordeaux",
  subregion: "Médoc",
  appellation: "Saint-Estèphe",
  alcoholPct: 13.5,
  grapes: [
    { name: "Cabernet Sauvignon", percentage: 60 },
    { name: "Merlot", percentage: 40 },
  ],
};

export const baseTasting = {
  tastedOn: "2026-03-14",
  personalScore: 8.4,
  purchasePrice: 55,
  currency: "USD",
  priceBasis: "retail_bottle",
  venue: "Home",
  occasion: "Dinner",
  foodPairing: "Lamb",
  wouldBuyAgain: true,
  impression: "Graphite and cassis, long finish.",
  notes: "Opened two hours ahead.",
  observations: [
    { dimension: "body", status: "assessed", value: 4 },
    { dimension: "acidity", status: "assessed", value: 3 },
    { dimension: "sweetness", status: "assessed", value: 1 },
    { dimension: "tannin", status: "assessed", value: 4 },
    { dimension: "aroma", status: "assessed", descriptor: "Blackcurrant" },
    { dimension: "aroma", status: "assessed", descriptor: "Graphite" },
  ],
  tags: ["Bordeaux night"],
};
