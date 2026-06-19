/**
 * Importar este módulo registra todos os Models no Database do mongoat.
 * O registro acontece no construtor de cada `new Model(...)` (efeito de import),
 * então basta importar os arquivos para que setupCollections() os enxergue.
 */
import "@/modules/ingredients/ingredient.model.js";
import "@/modules/recipes/recipe.model.js";
import "@/modules/favorites/favorite.model.js";
import "@/modules/usage/usage.model.js";
import "@/modules/pantry/pantry.model.js";
