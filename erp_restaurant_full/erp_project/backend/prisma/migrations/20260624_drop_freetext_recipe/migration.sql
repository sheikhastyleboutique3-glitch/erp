-- Restaurant ERP — remove legacy free-text recipe fields from products.
-- Recipes are now modelled relationally via the Recipe / RecipeComponent (BOM)
-- tables, so the old free-text columns are no longer used. Reversible by
-- re-adding the columns as nullable TEXT.
ALTER TABLE "products" DROP COLUMN IF EXISTS "recipe";
ALTER TABLE "products" DROP COLUMN IF EXISTS "recipeAr";
