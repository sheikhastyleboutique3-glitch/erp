/**
 * Canonical allergen list shared with the backend constant.
 * `key` matches the stored value; labels are resolved via i18n (allergen.<key>).
 */
export const ALLERGENS = [
  'GLUTEN',
  'DAIRY',
  'EGGS',
  'NUTS',
  'PEANUTS',
  'SOY',
  'SHELLFISH',
  'FISH',
  'SESAME',
  'CELERY',
  'MUSTARD',
  'SULPHITES',
] as const;

export type Allergen = (typeof ALLERGENS)[number];
