/**
 * Canonical list of allergens tracked on products.
 * Used by DTO validation and shared with the frontend multi-select.
 * Aligned with common EU/Gulf food-labelling allergen categories.
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
