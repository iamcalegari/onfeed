/**
 * Ingestão de um dataset público de receitas.
 *
 *   npm run ingest:dataset -- --file ./data/recipes.csv --adapter recipe-nlg --limit 500
 *
 * Flags:
 *   --file     caminho do CSV (obrigatório)
 *   --adapter  recipe-nlg | food-com   (default: recipe-nlg)
 *   --limit    máximo de receitas       (default: 100)
 *   --source   curated | user           (default: curated)
 *
 * Pré-requisitos: npm run setup:db && npm run seed:ingredients
 */
// connection cria o `new Database()` que o mongoat injeta nos models — tem que
// vir ANTES de qualquer import que toque um model (runBatchIngestion abaixo).
import {
  connectDatabase,
  disconnectDatabase,
} from "@/infra/database/connection.js";
// Registra os models no mongoat.
import "@/modules/index.js";
import {
  INGREDIENT_VECTOR_INDEX,
  waitForSearchIndexQueryable,
} from "@/infra/database/search-indexes.js";
import { loadRecipesFromCsv } from "@/infra/dataset/csv-loader.js";
import { ADAPTERS } from "@/infra/dataset/dataset.adapter.js";
import { runBatchIngestion } from "@/modules/recipes/recipe.batch-ingestion.js";
import type { RecipeSource } from "@/modules/recipes/recipe.types.js";

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const file = getFlag("file");
  if (!file) {
    throw new Error("--file é obrigatório (caminho do CSV)");
  }
  const adapterName = getFlag("adapter") ?? "recipe-nlg";
  const adapter = ADAPTERS[adapterName];
  if (!adapter) {
    throw new Error(
      `adapter desconhecido: ${adapterName} (opções: ${Object.keys(ADAPTERS).join(", ")})`,
    );
  }
  const limit = Number(getFlag("limit") ?? "100");
  const source = (getFlag("source") ?? "curated") as RecipeSource;

  console.log(`[ingest] lendo ${file} via '${adapterName}' (limite ${limit})`);
  const recipes = await loadRecipesFromCsv(file, adapter, { limit });
  console.log(`[ingest] ${recipes.length} receitas mapeadas`);

  if (recipes.length === 0) {
    console.warn("[ingest] nada para ingerir — verifique o arquivo/adapter");
    return;
  }

  await connectDatabase();

  // O fallback semântico da canonicalização depende deste índice. Se estiver
  // "building", termos novos viram pendings duplicados (ex: macarrao_espaguete
  // em vez de casar com macarrao). Espera ficar queryable antes de ingerir.
  await waitForSearchIndexQueryable("ingredients", INGREDIENT_VECTOR_INDEX);

  const report = await runBatchIngestion(recipes, { source });

  console.log(`[ingest] batch ${report.batchId}: ${report.succeeded} ok`);
  if (report.failed.length > 0) {
    console.log(`[ingest] ${report.failed.length} falhas:`);
    for (const f of report.failed.slice(0, 20)) {
      console.log(`  - ${f.customId}: ${f.reason}`);
    }
  }

  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[ingest] falhou:", err);
  process.exit(1);
});
