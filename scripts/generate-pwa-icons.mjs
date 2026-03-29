/**
 * Generates PWA and metadata icons (solid brand color, maskable-safe).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const appDir = path.join(root, "app");

const brand = { r: 0, g: 59, b: 102, alpha: 1 };

async function writeSquarePng(filename, size) {
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: brand,
    },
  })
    .png()
    .toFile(path.join(publicDir, filename));
}

async function main() {
  await writeSquarePng("web-app-manifest-192x192.png", 192);
  await writeSquarePng("web-app-manifest-512x512.png", 512);
  await writeSquarePng("icon1.png", 32);
  await writeSquarePng("apple-icon.png", 180);
  await writeSquarePng("favicon.png", 32);

  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: brand,
    },
  })
    .png()
    .toFile(path.join(appDir, "icon.png"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
