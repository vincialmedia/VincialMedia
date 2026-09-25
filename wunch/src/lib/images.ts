// Meal photos are stored in the public "meal-images" bucket in two sizes,
// resized and compressed on upload: <path>-800.webp and <path>-1600.webp.
export const MEAL_IMAGE_BUCKET = "meal-images";
export const MEAL_IMAGE_SIZES = [800, 1600] as const;

export function mealImageUrl(path: string | null | undefined, size: (typeof MEAL_IMAGE_SIZES)[number]): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${MEAL_IMAGE_BUCKET}/${path}-${size}.webp`;
}

export function mealImageSrcSet(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return MEAL_IMAGE_SIZES.map((s) => `${mealImageUrl(path, s)} ${s}w`).join(", ");
}
