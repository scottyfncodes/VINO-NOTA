/**
 * Generates the app icons from one vector mark: an ivory wine glass on
 * Cellar Burgundy, standing on a ruled line with a shorter line beneath it
 * (a glass and a note). Colours are the --cellar-burgundy and --archive-ivory
 * tokens. Run: npm run icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BURGUNDY = "#6e1f2b";
const IVORY = "#f3eee3";

/** The mark is drawn on a 1024 grid and scaled about its centre: below 1 for maskable safe zones, above 1 for small sizes. */
function mark(size: number, scale: number, radius: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="${(radius / size) * 1024}" fill="${BURGUNDY}"/>
  <g transform="translate(512 518) scale(${scale}) translate(-512 -524)">
    <path d="M356 342 H668 C656 452 606 530 512 548 C418 530 368 452 356 342 Z" fill="${IVORY}"/>
    <g fill="none" stroke="${IVORY}" stroke-width="42" stroke-linecap="round" stroke-linejoin="round">
      <path d="M346 202 H678 C694 374 642 536 512 562 C382 536 330 374 346 202 Z"/>
      <path d="M512 562 V736"/>
      <path d="M272 748 H752"/>
      <path d="M272 846 H548" stroke-width="30" opacity="0.7"/>
    </g>
  </g>
</svg>`;
}

async function main() {
  await mkdir("public/icons", { recursive: true });
  const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile("public/icons/icon-192.png", await png(mark(192, 1.06, 40)));
  await writeFile("public/icons/icon-512.png", await png(mark(512, 1.06, 108)));
  // Maskable: full-bleed background, mark inside the 80% safe zone.
  await writeFile("public/icons/icon-maskable-512.png", await png(mark(512, 0.86, 0)));
  // iOS applies its own corner mask, so the apple icon is square.
  await writeFile("src/app/apple-icon.png", await png(mark(180, 1, 0)));
  await writeFile("src/app/icon.svg", mark(64, 1.1, 14));
  console.log("Icons written.");
}

main();
