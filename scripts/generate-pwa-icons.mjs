/**
 * Generates PWA and metadata icons from `public/iconBase.png`.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const appDir = path.join(root, "app");

const baseIconPath = path.join(publicDir, "iconBase.png");

async function writeIconPngFromBase(dir, filename, size) {
  // `iconBase.png` is already square, but `fit: contain` keeps this robust
  // if the base ever changes.
  await sharp(baseIconPath)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(dir, filename));
}

async function main() {
  await writeIconPngFromBase(publicDir, "web-app-manifest-192x192.png", 192);
  await writeIconPngFromBase(publicDir, "web-app-manifest-512x512.png", 512);
  await writeIconPngFromBase(publicDir, "icon1.png", 32);
  // Used by `components/layout/*` via `import iconSrc from "@/app/icon1.png"`.
  await writeIconPngFromBase(appDir, "icon1.png", 32);
  await writeIconPngFromBase(publicDir, "apple-icon.png", 180);
  await writeIconPngFromBase(publicDir, "favicon.png", 32);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
