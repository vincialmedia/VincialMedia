/**
 * Uploads placeholder photos for the seed meals to Supabase Storage.
 * The placeholders are illustrations generated here (no stock photos), so
 * replace them with real photos of your dishes in Admin > Meals.
 *
 * Usage: npm run db:seed-images   (reads .env.local)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import sharp from "sharp";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    // rely on the real environment
  }
}

type Blob = { x: number; y: number; r: number; c: string; rx?: number };

// deterministic pseudo-random numbers so the images are stable
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function scatter(seed: number, count: number, colors: string[], radius: [number, number], spread = 190): Blob[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * spread;
    return { x: 400 + Math.cos(a) * d, y: 300 + Math.sin(a) * d * 0.95, r: radius[0] + r() * (radius[1] - radius[0]), c: colors[Math.floor(r() * colors.length)], rx: 0.6 + r() * 0.8 };
  });
}

const DISHES: Record<string, { bg: string; base: string; blobs: Blob[]; extra?: string }> = {
  "11111111-1111-4111-8111-000000000001": {
    bg: "#e9c46a",
    base: "#f3e2c0",
    blobs: [
      ...scatter(11, 26, ["#d9a45b", "#c98a3e", "#e8b96d"], [18, 34], 110).map((b) => ({ ...b, x: b.x - 70 })),
      ...scatter(12, 14, ["#a86b3c", "#8c5a33", "#f6ead2"], [10, 20], 120).map((b) => ({ ...b, x: b.x + 90 })),
      ...scatter(13, 10, ["#4f7f3a"], [3, 6], 170),
    ],
  },
  "11111111-1111-4111-8111-000000000002": {
    bg: "#f4a261",
    base: "#fbecc8",
    blobs: [
      ...scatter(21, 60, ["#f2c14e", "#f7d47a", "#e9b23c"], [8, 16], 170),
      ...scatter(22, 22, ["#8c5a2b", "#a0692f"], [6, 12], 150),
      ...scatter(23, 1, ["#e8d6a8"], [60, 60], 0).map((b) => ({ ...b, x: 560, y: 200 })),
    ],
  },
  "11111111-1111-4111-8111-000000000003": {
    bg: "#2a9d8f",
    base: "#f7f3e9",
    blobs: [
      ...scatter(31, 1, ["#9fbf5a"], [150, 150], 0).map((b) => ({ ...b, x: 330 })),
      ...scatter(32, 30, ["#ffffff", "#f4f1e8"], [10, 18], 90).map((b) => ({ ...b, x: b.x + 120, y: b.y - 20 })),
      ...scatter(33, 18, ["#e76f51", "#f4a261", "#fefae0", "#6a994e"], [8, 16], 130).map((b) => ({ ...b, x: b.x - 60 })),
    ],
  },
  "11111111-1111-4111-8111-000000000004": {
    bg: "#8ab17d",
    base: "#f6f1e7",
    blobs: [
      ...scatter(41, 40, ["#e9dcc0", "#d8c8a4"], [6, 10], 90).map((b) => ({ ...b, x: b.x - 90, y: b.y - 60 })),
      ...scatter(42, 1, ["#e6c99a"], [70, 70], 0).map((b) => ({ ...b, x: 500, y: 240 })),
      ...scatter(43, 12, ["#b5651d", "#c97c3a"], [18, 26], 70).map((b) => ({ ...b, x: b.x + 60, y: b.y + 90 })),
      ...scatter(44, 16, ["#e63946", "#f4a261", "#7cb518"], [9, 15], 70).map((b) => ({ ...b, x: b.x - 100, y: b.y + 90 })),
    ],
  },
  "11111111-1111-4111-8111-000000000005": {
    bg: "#6d597a",
    base: "#fbf6ee",
    blobs: [
      ...scatter(51, 1, ["#9d174d"], [170, 170], 0),
      ...scatter(52, 50, ["#be185d", "#a3154a", "#c2185b"], [8, 14], 150),
      ...scatter(53, 7, ["#fbf8f2"], [16, 26], 110),
      ...scatter(54, 9, ["#8b5a2b"], [7, 11], 130),
      ...scatter(55, 12, ["#4f7f3a"], [3, 5], 150),
    ],
  },
  "11111111-1111-4111-8111-000000000006": {
    bg: "#bc8a5f",
    base: "#fbf6ee",
    blobs: [
      ...scatter(61, 1, ["#4a2c1f"], [150, 150], 0),
      ...scatter(62, 30, ["#5c3a28", "#3b2218", "#6b4331"], [10, 22], 130),
      ...scatter(63, 12, ["#f5f0e6"], [3, 5], 120),
    ],
  },
};

function svg(dish: (typeof DISHES)[string]) {
  const blobs = dish.blobs
    .map((b) => `<ellipse cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" rx="${b.r.toFixed(1)}" ry="${(b.r * (b.rx ?? 1)).toFixed(1)}" fill="${b.c}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-opacity=".25"/></filter>
    <clipPath id="plate"><circle cx="400" cy="300" r="222"/></clipPath>
  </defs>
  <rect width="800" height="600" fill="${dish.bg}"/>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="400" cy="300" r="262" fill="#ffffff" filter="url(#s)"/>
  <circle cx="400" cy="300" r="238" fill="#f4efe6"/>
  <circle cx="400" cy="300" r="222" fill="${dish.base}"/>
  <g clip-path="url(#plate)">${blobs}</g>
  <rect x="690" y="120" width="16" height="360" rx="8" fill="#e8e2d8" filter="url(#s)"/>
  <rect x="94" y="140" width="14" height="330" rx="7" fill="#e8e2d8" filter="url(#s)"/>
</svg>`;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (e.g. in .env.local)");
  const db = createClient(url, key, { auth: { persistSession: false } });

  for (const [id, dish] of Object.entries(DISHES)) {
    const { data: meal } = await db.from("meals").select("id").eq("id", id).maybeSingle();
    if (!meal) continue;
    const png = await sharp(Buffer.from(svg(dish))).png().toBuffer();
    const path = `seed/${id}`;
    for (const width of [800, 1600]) {
      const body = await sharp(png).resize({ width, height: (width * 3) / 4 }).webp({ quality: 80 }).toBuffer();
      const { error } = await db.storage.from("meal-images").upload(`${path}-${width}.webp`, body, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
      if (error) throw error;
    }
    await db.from("meals").update({ image_path: path }).eq("id", id);
    console.log(`uploaded ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
