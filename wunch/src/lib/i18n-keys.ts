// Typed keys for messages that are looked up dynamically.
import type de from "../../messages/de.json";

export type Category = keyof typeof de.menu.categories;
export type DietaryTag = keyof typeof de.dietary;
export type Allergen = keyof typeof de.allergens;
export type AuthErrorKey = keyof typeof de.auth.errors;
export type ErrorKey = keyof typeof de.errors;
export type StatusKey = keyof typeof de.status;

export const ALLERGENS: Allergen[] = [
  "gluten", "crustaceans", "eggs", "fish", "peanuts", "soybeans", "milk",
  "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs",
];
export const DIETARY_TAGS: DietaryTag[] = ["vegetarian", "vegan", "gluten_free", "lactose_free", "spicy"];
export const CATEGORIES: Category[] = ["main", "soup", "salad", "side", "dessert", "drink"];
