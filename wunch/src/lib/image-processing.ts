import "server-only";
import sharp from "sharp";
import { MEAL_IMAGE_SIZES } from "./images";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["jpeg", "png", "webp", "heif", "avif"]);

/**
 * Resize and compress a meal photo into 4:3 WebP variants (800w and 1600w).
 * Strips metadata (including GPS) and honours the camera orientation.
 */
export async function processMealImage(input: Buffer): Promise<Record<(typeof MEAL_IMAGE_SIZES)[number], Buffer>> {
  const meta = await sharp(input).metadata();
  if (!meta.format || !ALLOWED.has(meta.format)) throw new Error("unsupported_image");
  const out = {} as Record<(typeof MEAL_IMAGE_SIZES)[number], Buffer>;
  for (const width of MEAL_IMAGE_SIZES) {
    out[width] = await sharp(input)
      .rotate()
      .resize({ width, height: Math.round((width * 3) / 4), fit: "cover", position: "attention", withoutEnlargement: false })
      .webp({ quality: width > 1000 ? 72 : 78, effort: 4 })
      .toBuffer();
  }
  return out;
}
