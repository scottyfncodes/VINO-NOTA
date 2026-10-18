/**
 * Generates the app icons from one vector mark: an ivory wine glass on
 * Cellar Burgundy, with a field-journal rule beneath. Run: npm run icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

function mark(size: number, padding: number, radius: number) {
  const s = size;
  const inner = s - padding * 2;
  const u = inner / 100;
  const x = (v: number) => padding + v * u;
  const y = (v: number) => padding + v * u;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${radius}" fill="#722F37"/>
  <g fill="none" stroke="#F4F0E7" stroke-width="${4.2 * u}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${x(31)} ${y(14)} H${x(69)} C${x(72)} ${y(36)} ${x(66)} ${y(52)} ${x(50)} ${y(55)} C${x(34)} ${y(52)} ${x(28)} ${y(36)} ${x(31)} ${y(14)} Z"/>
    <path d="M${x(50)} ${y(55)} V${y(78)}"/>
    <path d="M${x(36)} ${y(80)} H${x(64)}"/>
  </g>
  <path d="M${x(30.6)} ${y(30)} H${x(69.4)} C${x(68.5)} ${y(43)} ${x(62)} ${y(51.5)} ${x(50)} ${y(53.3)} C${x(38)} ${y(51.5)} ${x(31.5)} ${y(43)} ${x(30.6)} ${y(30)} Z" fill="#F4F0E7" opacity="0.92"/>
  <path d="M${x(22)} ${y(92)} H${x(78)}" stroke="#9B987B" stroke-width="${1.6 * u}" stroke-linecap="round"/>
</svg>`;
}

async function main() {
  await mkdir("public/icons", { recursive: true });
  const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile("public/icons/icon-192.png", await png(mark(192, 26, 40)));
  await writeFile("public/icons/icon-512.png", await png(mark(512, 70, 108)));
  // Maskable: full-bleed background, mark inside the 80% safe zone.
  await writeFile("public/icons/icon-maskable-512.png", await png(mark(512, 112, 0)));
  // iOS applies its own corner mask, so the apple icon is square.
  await writeFile("src/app/apple-icon.png", await png(mark(180, 26, 0)));
  await writeFile("src/app/icon.svg", mark(64, 6, 14));
  console.log("Icons written.");
}

main();
