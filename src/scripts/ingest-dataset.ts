/**
 * Ingestão de um dataset público de receitas.
 *
 *   npm run ingest:dataset -- --file ./data/recipes.csv --adapter food-com --limit 500
 *
 * Flags:
 *   --file     caminho do CSV (obrigatório, exceto com --resume)
 *   --adapter  recipe-nlg | food-com   (default: recipe-nlg)
 *   --limit    máximo de receitas       (default: 100)
 *   --source   curated | user           (default: curated)
 *   --sample   amostra distribuída pelo arquivo (em vez das primeiras N)
 *   --resume   retoma de checkpoint salvo: --resume ./data/ingest-XXXX.ckpt.json
 *
 * Checkpoint: salvo automaticamente em ./data/ingest-<timestamp>.ckpt.json durante
 * a criação dos batches. Se o processo cair (crédito esgotado, rede), use --resume
 * para retomar sem re-submeter o que já foi enviado.
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

import { mkdirSync } from "node:fs";

import {
  INGREDIENT_VECTOR_INDEX,
  waitForSearchIndexQueryable,
} from "@/infra/database/search-indexes.js";
import { loadRecipesFromCsv } from "@/infra/dataset/csv-loader.js";
import { ADAPTERS } from "@/infra/dataset/dataset.adapter.js";
import {
  runBatchIngestion,
  CreditExhaustedError,
} from "@/modules/recipes/recipe.batch-ingestion.js";
import type { RecipeSource } from "@/modules/recipes/recipe.types.js";

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function defaultCheckpointPath(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `./data/ingest-${ts}.ckpt.json`;
}

async function main(): Promise<void> {
  const resumePath = getFlag("resume");
  const source = (getFlag("source") ?? "curated") as RecipeSource;

  mkdirSync("./data", { recursive: true });
  const checkpointPath = resumePath ?? defaultCheckpointPath();

  // No resume, recipes vêm do checkpoint internamente (runBatchIngestion carrega)
  let recipes = [] as Awaited<ReturnType<typeof loadRecipesFromCsv>>;

  if (resumePath) {
    console.log(`[ingest] retomando checkpoint: ${resumePath}`);
  } else {
    const file = getFlag("file");
    if (!file) throw new Error("--file é obrigatório (ou use --resume)");

    const adapterName = getFlag("adapter") ?? "recipe-nlg";
    const adapter = ADAPTERS[adapterName];
    if (!adapter) {
      throw new Error(
        `adapter desconhecido: ${adapterName} (opções: ${Object.keys(ADAPTERS).join(", ")})`,
      );
    }
    const limit = Number(getFlag("limit") ?? "100");
    const sample = process.argv.includes("--sample");

    console.log(
      `[ingest] lendo ${file} via '${adapterName}' (limite ${limit}${sample ? ", amostra distribuída" : ""})`,
    );
    recipes = await loadRecipesFromCsv(file, adapter, { limit, sample });
    console.log(`[ingest] ${recipes.length} receitas mapeadas`);

    if (recipes.length === 0) {
      console.warn("[ingest] nada para ingerir — verifique o arquivo/adapter");
      return;
    }
  }

  await connectDatabase();
  await waitForSearchIndexQueryable("ingredients", INGREDIENT_VECTOR_INDEX);

  try {
    const report = await runBatchIngestion(recipes, { source, checkpointPath });
    console.log(`[ingest] batch(es): ${report.batchId}`);
    console.log(`[ingest] ${report.succeeded} ok`);
    if (report.failed.length > 0) {
      console.log(`[ingest] ${report.failed.length} falhas:`);
      for (const f of report.failed.slice(0, 20)) {
        console.log(`  - ${f.customId}: ${f.reason}`);
      }
    }
  } catch (err) {
    if (err instanceof CreditExhaustedError) {
      console.error("\n[ingest] Crédito insuficiente — progresso salvo em:");
      console.error(`  ${err.checkpointPath ?? "(sem checkpoint configurado)"}`);
      console.error("\n[ingest] Após recarregar créditos, retome com:");
      if (err.checkpointPath) {
        console.error(`  npm run ingest:dataset -- --resume ${err.checkpointPath}`);
      }
      process.exit(1);
    }
    throw err;
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error("[ingest] falhou:", err);
  process.exit(1);
});
