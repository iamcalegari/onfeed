/**
 * Migração: preenche quantity + unit nos ingredientes que possuem raw mas
 * ainda não têm quantidade definida.
 *
 * Usa a Batches API da Anthropic por padrão (50% mais barato, sem rate-limit).
 * Com --direct, processa sincronamente em pool de 5 (bom para testes).
 *
 *   npm run migrate:quantities -- [--limit N] [--direct] [--dry-run]
 *
 * Flags:
 *   --limit N   máximo de receitas a processar (default: todas)
 *   --direct    usa Messages API direta em vez da Batches API
 *   --dry-run   só conta e exibe o que seria feito, sem alterar nada
 */

// connection DEVE vir antes de qualquer import que toque um model
import {
  connectDatabase,
  disconnectDatabase,
} from "@/infra/database/connection.js";
import "@/modules/index.js";

import { ObjectId } from "mongodb";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  anthropic,
  EXTRACTION_MODEL,
} from "@/infra/llm/anthropic.client.js";
import { RecipeModel } from "@/modules/recipes/recipe.model.js";
import type { RecipeIngredient } from "@/modules/recipes/recipe.types.js";

// ---------------------------------------------------------------------------
// Schema de saída: apenas quantity + unit por ingrediente
// ---------------------------------------------------------------------------

const IngredientQtySchema = z.array(
  z.object({
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
  }),
);

type IngredientQty = z.infer<typeof IngredientQtySchema>[number];

const QTY_FORMAT = zodOutputFormat(IngredientQtySchema);

const QTY_SYSTEM_PROMPT = `Você recebe um array JSON de linhas de ingredientes de receita.
Para cada linha, extraia somente quantity (número decimal, ou null) e unit (em pt-BR, ou null).
Retorne um array JSON com o mesmo número de elementos e na mesma ordem da entrada.
Regras:
- Frações → decimal: 1/2 → 0.5, 3/4 → 0.75, 1 1/2 → 1.5, 1/4 → 0.25.
- Unidades sempre em pt-BR: "xícara", "colher de sopa", "colher de chá", "copo",
  "g", "kg", "mg", "ml", "l", "cl", "pitada", "dente", "fatia", "ramo", "folha",
  "unidade", "lata", "sachê", "dose".
- "a gosto" / "to taste" / "q.b." / "as needed": quantity=null, unit="a gosto".
- Contagem sem unidade (ex: "3 ovos", "2 eggs"): quantity=N, unit=null.
- Sem informação de quantidade (ex: "farinha de trigo", "flour"): quantity=null, unit=null.`;

function buildQtyParams(raws: string[]) {
  return {
    model: EXTRACTION_MODEL,
    max_tokens: 512,
    output_config: { format: QTY_FORMAT },
    system: QTY_SYSTEM_PROMPT,
    messages: [
      { role: "user" as const, content: JSON.stringify(raws) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers de CLI
// ---------------------------------------------------------------------------

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const isDryRun = process.argv.includes("--dry-run");
const isDirect = process.argv.includes("--direct");
const limit = getFlag("limit") ? Number(getFlag("limit")) : Infinity;

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface CandidateRecipe {
  _id: ObjectId;
  title: string;
  ingredients: RecipeIngredient[];
}

// ---------------------------------------------------------------------------
// Busca de candidatos no DB
// ---------------------------------------------------------------------------

async function fetchCandidates(): Promise<CandidateRecipe[]> {
  // Receitas onde ao menos um ingrediente tem raw não-vazio mas sem quantity.
  const docs = (await RecipeModel.aggregate([
    {
      $match: {
        $and: [
          { "ingredients.raw": { $not: { $eq: "" } } },
          { "ingredients.quantity": { $exists: false } },
        ],
      },
    },
    { $project: { title: 1, ingredients: 1 } },
    ...(Number.isFinite(limit) ? [{ $limit: limit }] : []),
  ])) as CandidateRecipe[];

  return docs;
}

// ---------------------------------------------------------------------------
// Mescla os novos quantity/unit nos ingredientes da receita
// ---------------------------------------------------------------------------

function applyQties(
  ingredients: RecipeIngredient[],
  qtys: IngredientQty[],
): RecipeIngredient[] {
  return ingredients.map((ing, i) => {
    const q = qtys[i];
    if (!q) return ing;
    const patched = { ...ing };
    if (q.quantity !== null) patched.quantity = q.quantity;
    else delete patched.quantity;
    if (q.unit !== null) patched.unit = q.unit;
    else delete patched.unit;
    return patched;
  });
}

// ---------------------------------------------------------------------------
// Modo DIRETO: pool de concorrência 5
// ---------------------------------------------------------------------------

async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<(R | Error)[]> {
  const results: (R | Error)[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await fn(items[idx]!, idx);
      } catch (err) {
        results[idx] = err instanceof Error ? err : new Error(String(err));
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

async function runDirect(candidates: CandidateRecipe[]): Promise<void> {
  console.log(`[migrate] modo direto — pool=5, ${candidates.length} receitas`);

  const results = await pool(candidates, 5, async (recipe, idx) => {
    const raws = recipe.ingredients.map((i) => i.raw);
    const res = await anthropic.messages.parse(buildQtyParams(raws));
    if (!res.parsed_output) {
      throw new Error(`parse falhou (stop_reason=${res.stop_reason})`);
    }
    console.log(
      `[migrate] ${idx + 1}/${candidates.length} "${recipe.title}" — ok`,
    );
    return { recipe, qtys: res.parsed_output };
  });

  let ok = 0;
  let err = 0;
  const ops = [];
  for (const r of results) {
    if (r instanceof Error) {
      err++;
      console.warn(`[migrate] erro: ${r.message}`);
      continue;
    }
    ok++;
    const updated = applyQties(r.recipe.ingredients, r.qtys);
    ops.push({
      updateOne: {
        filter: { _id: r.recipe._id },
        update: { $set: { ingredients: updated, updatedAt: new Date() } },
      },
    });
  }

  if (!isDryRun && ops.length > 0) {
    await RecipeModel.bulkWrite(ops as never[]);
    console.log(`[migrate] ${ok} receitas atualizadas, ${err} erros`);
  } else {
    console.log(`[migrate] dry-run — ${ok} seriam atualizadas, ${err} erros`);
  }
}

// ---------------------------------------------------------------------------
// Modo BATCH: Batches API da Anthropic (default)
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000;
function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function runBatch(candidates: CandidateRecipe[]): Promise<void> {
  console.log(`[migrate] modo batch — ${candidates.length} receitas`);

  const byId = new Map<string, CandidateRecipe>();
  const requests = candidates.map((recipe) => {
    const id = recipe._id.toHexString();
    byId.set(id, recipe);
    return {
      custom_id: id,
      params: buildQtyParams(recipe.ingredients.map((i) => i.raw)),
    };
  });

  const batch = await anthropic.messages.batches.create({ requests });
  console.log(`[migrate] batch ${batch.id} submetido (${requests.length} requests)`);

  let status = batch;
  while (status.processing_status !== "ended") {
    await sleep(POLL_INTERVAL_MS);
    status = await anthropic.messages.batches.retrieve(batch.id);
    const c = status.request_counts;
    console.log(
      `[migrate] ${status.processing_status} — ok:${c.succeeded} erro:${c.errored} processando:${c.processing}`,
    );
  }

  const ops = [];
  let ok = 0;
  let err = 0;

  for await (const entry of await anthropic.messages.batches.results(batch.id)) {
    const recipe = byId.get(entry.custom_id);
    if (!recipe) continue;

    if (entry.result.type !== "succeeded") {
      err++;
      console.warn(`[migrate] ${entry.custom_id} falhou: ${entry.result.type}`);
      continue;
    }

    try {
      const textBlock = entry.result.message.content.find(
        (b) => b.type === "text",
      );
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("sem bloco de texto na resposta");
      }
      const qtys = IngredientQtySchema.parse(JSON.parse(textBlock.text));
      const updated = applyQties(recipe.ingredients, qtys);
      ops.push({
        updateOne: {
          filter: { _id: recipe._id },
          update: { $set: { ingredients: updated, updatedAt: new Date() } },
        },
      });
      ok++;
    } catch (e) {
      err++;
      console.warn(
        `[migrate] parse falhou para "${recipe.title}": ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  if (!isDryRun && ops.length > 0) {
    await RecipeModel.bulkWrite(ops as never[]);
    console.log(
      `[migrate] batch ${batch.id} concluído: ${ok} atualizadas, ${err} erros`,
    );
  } else {
    console.log(
      `[migrate] dry-run — ${ok} seriam atualizadas, ${err} erros`,
    );
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await connectDatabase();

  const candidates = await fetchCandidates();
  console.log(`[migrate] ${candidates.length} receitas sem quantity`);

  if (candidates.length === 0) {
    console.log("[migrate] nada a fazer");
    await disconnectDatabase();
    return;
  }

  if (isDryRun) {
    console.log("[migrate] dry-run ativado — nenhuma alteração será feita");
    const sample = candidates.slice(0, 3);
    for (const r of sample) {
      console.log(
        `  ex: "${r.title}" — ${r.ingredients.length} ingredientes` +
          ` (raw[0]: "${r.ingredients[0]?.raw ?? "?"}")`,
      );
    }
    await disconnectDatabase();
    return;
  }

  if (isDirect) {
    await runDirect(candidates);
  } else {
    await runBatch(candidates);
  }

  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[migrate] falhou:", err);
  process.exit(1);
});
