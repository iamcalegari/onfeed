/**
 * Seed síncrono de receitas de exemplo (sem dataset/Batches) — pra testar a
 * busca, o match I/E/T/N, o detalhe e a adaptação na hora.
 *
 * Cada receita passa pela ingestão real (extração LLM → canonicalização →
 * embedding → insert), só que sequencial.
 *
 *   yarn seed:recipes
 *
 * Pré-requisitos: yarn setup:db && yarn seed:ingredients
 */
// connection cria o Database que o mongoat injeta nos models — antes dos models.
import {
  connectDatabase,
  disconnectDatabase,
} from "@/infra/database/connection.js";
import "@/modules/index.js";
import { ingestRecipe } from "@/modules/recipes/recipe.ingestion.js";
import { RecipeModel } from "@/modules/recipes/recipe.model.js";
import { SAMPLE_RECIPES } from "@/modules/recipes/recipe.sample-data.js";

async function main(): Promise<void> {
  await connectDatabase();
  console.log(`[seed:recipes] ingerindo ${SAMPLE_RECIPES.length} receitas...`);

  let ok = 0;
  let skipped = 0;
  for (const recipe of SAMPLE_RECIPES) {
    // idempotente: pula o que já foi inserido (re-rodar só completa o que falta)
    const existing = await RecipeModel.find({ title: recipe.title } as never);
    if (existing) {
      skipped++;
      console.log(`  ↷ ${recipe.title} (já existe)`);
      continue;
    }
    try {
      await ingestRecipe(recipe, { source: "curated" });
      ok++;
      console.log(`  ✓ ${recipe.title}`);
    } catch (err) {
      console.error(
        `  ✗ ${recipe.title}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(
    `[seed:recipes] concluído: ${ok} novas, ${skipped} já existentes.`,
  );
  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[seed:recipes] falhou:", err);
  process.exit(1);
});
