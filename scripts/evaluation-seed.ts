/**
 * Fills a local database with a small, fixed journal for one throwaway account,
 * so the GITCRAFT evaluation (.gitcraft/evaluation.json) and manual checks have
 * signed-in screens worth measuring. Local databases only: it refuses anything
 * else, and it never touches an account that already has wines.
 *
 * Run it with the app already serving the same database:
 *   npm run build && npm run start -- -p 3100
 *   npm run evaluation:seed
 */
import "dotenv/config";
import postgres from "postgres";
import sharp from "sharp";
import { createWine } from "../src/server/catalog/wines";
import { closeDb } from "../src/server/db";
import { uploadImage } from "../src/server/images";
import { createTasting } from "../src/server/tastings";
import { assertLocalDatabaseUrl } from "../tests/support/local-database";

const BASE = process.env.EVALUATION_URL ?? "http://localhost:3100";
// Not a secret: a fixture for a database on this machine, the same one the e2e helpers use.
const ACCOUNT = { name: "Evaluation", email: "evaluation@example.test", password: "correct-horse-battery" };

type Entry = {
  name: string;
  producer: string;
  vintage: number | null;
  wineType: string;
  country: string;
  region: string;
  subregion?: string;
  appellation?: string;
  grapes: [string, number | null][];
  tastings: [date: string, score: number | null, price: number, impression: string][];
  label: [paper: string, ink: string] | null;
};

const JOURNAL: Entry[] = [
  { name: "Les Pagodes de Cos", producer: "Château Cos d'Estournel", vintage: 2016, wineType: "red", country: "FR", region: "Bordeaux", subregion: "Médoc", appellation: "Saint-Estèphe", grapes: [["Cabernet Sauvignon", 60], ["Merlot", 40]], tastings: [["2026-03-14", 8.4, 55, "Graphite and cassis, long finish."], ["2026-09-02", 8.9, 58, "Opened up beautifully. Cedar, pencil shavings."]], label: ["#3b2a26", "#e8dfc9"] },
  { name: "Clos de la Coulée de Serrant", producer: "Nicolas Joly", vintage: 2019, wineType: "white", country: "FR", region: "Loire", subregion: "Anjou", appellation: "Savennières", grapes: [["Chenin Blanc", 100]], tastings: [["2026-04-20", 9.1, 95, "Quince, beeswax, chalk. Electric."]], label: ["#efe6cf", "#3a3323"] },
  { name: "Barolo Cannubi", producer: "Giacomo Borgogno & Figli", vintage: 2017, wineType: "red", country: "IT", region: "Piedmont", subregion: "Langhe", appellation: "Barolo", grapes: [["Nebbiolo", 100]], tastings: [["2026-05-11", 8.7, 82, "Tar and roses, grippy tannin."]], label: ["#f4efe2", "#6e1f2b"] },
  { name: "Riesling Kabinett Wehlener Sonnenuhr", producer: "Joh. Jos. Prüm", vintage: 2021, wineType: "white", country: "DE", region: "Mosel", grapes: [["Riesling", 100]], tastings: [["2026-06-03", 8.8, 38, "Lime, slate, a whisper of sweetness."], ["2026-10-12", 9.0, 38, "Even better with a little air."]], label: ["#dfe6d8", "#1f3a2c"] },
  { name: "Rioja Reserva Viña Tondonia", producer: "R. López de Heredia", vintage: 2011, wineType: "red", country: "ES", region: "Rioja", subregion: "Rioja Alta", grapes: [["Tempranillo", 75], ["Garnacha", 15]], tastings: [["2026-06-28", 8.2, 45, "Dried cherry, leather, old oak."]], label: ["#f0e4c8", "#7a2a1e"] },
  { name: "Whispering Angel", producer: "Château d'Esclans", vintage: 2024, wineType: "rose", country: "FR", region: "Provence", appellation: "Côtes de Provence", grapes: [["Grenache", null], ["Cinsault", null]], tastings: [["2026-07-15", 6.4, 24, "Pale, easy, a little anonymous."]], label: ["#f6e3de", "#8a5a55"] },
  { name: "Brut Réserve", producer: "Billecart-Salmon", vintage: null, wineType: "sparkling", country: "FR", region: "Champagne", grapes: [["Pinot Meunier", 40], ["Pinot Noir", 30], ["Chardonnay", 30]], tastings: [["2026-08-01", 8.5, 62, "Fine mousse, brioche, green apple."]], label: ["#f3ead2", "#2b2b2b"] },
  { name: "Pinot Noir Te Muna Road", producer: "Craggy Range", vintage: 2022, wineType: "red", country: "NZ", region: "Martinborough", grapes: [["Pinot Noir", 100]], tastings: [["2026-08-19", 7.6, 34, "Bright cherry, a touch warm."]], label: null },
  { name: "Tokaji Aszú 5 Puttonyos", producer: "Royal Tokaji", vintage: 2017, wineType: "dessert", country: "HU", region: "Tokaj", grapes: [["Furmint", null]], tastings: [["2026-09-21", 9.2, 48, "Apricot, saffron, laser acidity."]], label: ["#e9c46a", "#3b2a12"] },
  { name: "Ribolla Gialla Anfora", producer: "Gravner", vintage: 2015, wineType: "orange", country: "IT", region: "Friuli-Venezia Giulia", subregion: "Collio", grapes: [["Ribolla Gialla", 100]], tastings: [["2026-10-30", null, 110, "Tea, dried orange peel. Not sure yet."]], label: ["#c98a4b", "#2a1a10"] },
  { name: "Malbec Catena Alta", producer: "Catena Zapata", vintage: 2020, wineType: "red", country: "AR", region: "Mendoza", grapes: [["Malbec", 100]], tastings: [["2026-11-08", 7.9, 42, "Plush, violets, generous oak."]], label: ["#22313f", "#e9e2d4"] },
  { name: "Fino Tío Pepe en Rama", producer: "González Byass", vintage: null, wineType: "fortified", country: "ES", region: "Jerez", grapes: [["Palomino", 100]], tastings: [["2026-11-12", 8.1, 22, "Almond, sea spray, bone dry."]], label: ["#f7f1e1", "#b8862e"] },
];
const AROMAS = ["Blackcurrant", "Quince", "Rose", "Lime", "Leather", "Strawberry", "Brioche", "Cherry", "Apricot", "Orange peel", "Violet", "Almond"];

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** A plain drawn label, so the journal has photographs without shipping anyone's real ones. */
function label(e: Entry, [paper, ink]: [string, string]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#1a1413"/><rect x="150" y="40" width="600" height="1120" rx="90" fill="#221b1a"/><rect x="190" y="330" width="520" height="620" fill="${paper}"/><rect x="214" y="354" width="472" height="572" fill="none" stroke="${ink}" stroke-width="2"/><text x="450" y="470" font-family="Georgia,serif" font-size="30" letter-spacing="6" fill="${ink}" text-anchor="middle">${xml(e.producer.toUpperCase().slice(0, 24))}</text><text x="450" y="640" font-family="Georgia,serif" font-style="italic" font-size="54" fill="${ink}" text-anchor="middle">${xml(e.name.split(" ").slice(0, 3).join(" "))}</text><text x="450" y="840" font-family="Georgia,serif" font-size="64" fill="${ink}" text-anchor="middle">${e.vintage ?? "NV"}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

async function main() {
  const sql = postgres(assertLocalDatabaseUrl(process.env.DATABASE_URL), { max: 1, onnotice: () => {} });
  try {
    let [user] = await sql<{ id: string }[]>`select id from "user" where email = ${ACCOUNT.email}`;
    if (!user) {
      // Through the app, so the password is hashed exactly as a real sign-up's is.
      const res = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(ACCOUNT) });
      if (!res.ok) throw new Error(`Sign-up at ${BASE} answered ${res.status}. Is the app running against this database?`);
      [user] = await sql<{ id: string }[]>`select id from "user" where email = ${ACCOUNT.email}`;
      if (!user) throw new Error(`The app at ${BASE} is not using this database: the new account is not in it.`);
    }
    const [{ wines }] = await sql<{ wines: number }[]>`select count(*)::int as wines from wine where owner_id = ${user.id}`;
    if (wines > 0) {
      console.log(`${ACCOUNT.email} already has ${wines} wines; left as it is.`);
      return;
    }
    for (const [i, e] of JOURNAL.entries()) {
      const wine = await createWine(user.id, { name: e.name, producer: e.producer, vintage: e.vintage, isNonVintage: e.vintage === null, wineType: e.wineType, country: e.country, region: e.region, subregion: e.subregion ?? null, appellation: e.appellation ?? null, grapes: e.grapes.map(([name, percentage]) => ({ name, percentage })) });
      if (e.label) await uploadImage(user.id, await label(e, e.label), { wineId: wine.id });
      for (const [tastedOn, personalScore, purchasePrice, impression] of e.tastings) {
        await createTasting(user.id, wine.id, {
          tastedOn,
          personalScore,
          purchasePrice,
          currency: "USD",
          priceBasis: "retail_bottle",
          venue: i % 2 ? "Home" : "Noble Rot",
          occasion: "Dinner",
          wouldBuyAgain: (personalScore ?? 0) > 8,
          impression,
          notes: i % 3 === 0 ? "Decanted an hour ahead." : null,
          observations: [
            { dimension: "body", status: "assessed", value: 2 + (i % 4) },
            { dimension: "acidity", status: "assessed", value: 2 + ((i * 2) % 4) },
            { dimension: "sweetness", status: "assessed", value: e.wineType === "dessert" ? 5 : 1 },
            ...(e.wineType === "red" ? [{ dimension: "tannin", status: "assessed", value: 3 + (i % 3) }] : []),
            { dimension: "aroma", status: "assessed", descriptor: AROMAS[i] },
          ],
          tags: i % 4 === 0 ? ["Cellar"] : [],
        });
      }
    }
    console.log(`Seeded ${JOURNAL.length} wines for ${ACCOUNT.email}.`);
  } finally {
    await sql.end();
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
