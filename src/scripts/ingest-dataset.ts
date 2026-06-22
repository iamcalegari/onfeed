/**
 * Ingestão de um dataset público de receitas.
 *
 *   npm run ingest:dataset -- --file ./data/recipes.csv --adapter food-com --limit 500
 *
 * Flags:
 *   --file          caminho do CSV de receitas (obrigatório, exceto com --resume)
 *   --adapter       recipe-nlg | food-com   (default: recipe-nlg)
 *   --limit         máximo de receitas       (default: 100)
 *   --source        curated | user           (default: curated)
 *   --sample        amostra distribuída pelo arquivo (em vez das primeiras N)
 *   --interactions  caminho do CSV de interações para ranking por popularidade
 *   --resume        retoma de checkpoint salvo: --resume ./data/ingest-XXXX.ckpt.json
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
import { rankRecipesByInteractions } from "@/infra/dataset/interactions-ranker.js";
import {
  runBatchIngestion,
  CreditExhaustedError,
} from "@/modules/recipes/recipe.batch-ingestion.js";
import { RecipeModel } from "@/modules/recipes/recipe.model.js";
import type { RecipeSource } from "@/modules/recipes/recipe.types.js";

// ---------------------------------------------------------------------------
// Live progress display
// ---------------------------------------------------------------------------

class LiveProgress {
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = "";
  private current = 0;
  private total = 0;
  private startMs = 0;
  private extra = "";
  private lineActive = false;
  private origLog = console.log;
  private origWarn = console.warn;

  start(step: string, total = 0, extra = ""): void {
    this.step = step;
    this.current = 0;
    this.total = total;
    this.startMs = Date.now();
    this.extra = extra;
    this.lineActive = false;

    // Intercepta console.log para não colidir com a linha de progresso
    const self = this;
    console.log = (...args: unknown[]) => {
      self.clearLine();
      self.origLog.apply(console, args);
      self.render();
    };
    console.warn = (...args: unknown[]) => {
      self.clearLine();
      self.origWarn.apply(console, args);
      self.render();
    };

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.render(), 1000);
    this.render();
  }

  update(current: number, extra?: string): void {
    this.current = current;
    if (extra !== undefined) this.extra = extra;
  }

  finish(message: string): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.clearLine();
    console.log = this.origLog;
    console.warn = this.origWarn;
    const elapsed = this.fmtTime((Date.now() - this.startMs) / 1000);
    this.origLog(`[${this.step}] ${message} (${elapsed})`);
    this.lineActive = false;
  }

  private clearLine(): void {
    if (this.lineActive) {
      process.stdout.write("\x1b[2K\r");
      this.lineActive = false;
    }
  }

  private render(): void {
    const elapsed = (Date.now() - this.startMs) / 1000;
    const cur = this.n(this.current);

    let line: string;
    if (this.total > 0) {
      const pct = Math.min(this.current / this.total, 1);
      const bar = this.bar(pct);
      const etaSecs = pct > 0.02 ? elapsed / pct - elapsed : null;
      const eta = etaSecs !== null ? `~${this.fmtTime(etaSecs)} restantes` : "calculando...";
      line = `[${this.step}] ${cur} / ${this.n(this.total)}  ${bar}  ${(pct * 100).toFixed(1)}%  ${eta}`;
    } else {
      const rate = elapsed > 0 ? Math.round(this.current / elapsed) : 0;
      line = `[${this.step}] ${cur}  ${this.n(rate)}/s  ${this.fmtTime(elapsed)}`;
    }

    if (this.extra) line += `  |  ${this.extra}`;

    process.stdout.write(`\x1b[2K\r${line}`);
    this.lineActive = true;
  }

  private bar(pct: number, width = 16): string {
    const filled = Math.round(pct * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
  }

  private n(n: number): string {
    return n.toLocaleString("pt-BR");
  }

  private fmtTime(secs: number): string {
    if (secs < 60) return `${Math.round(secs)}s`;
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60).toString().padStart(2, "0");
    return `${m}m${s}s`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function defaultCheckpointPath(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `./data/ingest-${ts}.ckpt.json`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const resumePath = getFlag("resume");
  const source = (getFlag("source") ?? "curated") as RecipeSource;

  mkdirSync("./data", { recursive: true });
  const checkpointPath = resumePath ?? defaultCheckpointPath();

  let recipes = [] as Awaited<ReturnType<typeof loadRecipesFromCsv>>;
  const progress = new LiveProgress();

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
    const interactionsFile = getFlag("interactions");

    // Etapa 1 — ranking por interações
    let allowIds: string[] | undefined;
    if (interactionsFile) {
      progress.start("ranking");
      allowIds = await rankRecipesByInteractions(interactionsFile, {
        topN: limit,
        minReviews: 5,
        onProgress: (lines) => progress.update(lines),
      });
      progress.finish(`${allowIds.length.toLocaleString("pt-BR")} receitas selecionadas por popularidade`);
    }

    // Etapa 2 — carregamento do CSV
    const loadTotal = allowIds ? Math.min(allowIds.length, limit) : 0;
    progress.start("receitas", loadTotal, allowIds ? "filtrando por ranking" : "");
    recipes = await loadRecipesFromCsv(file, adapter, {
      limit,
      sample: allowIds ? false : sample,
      ...(allowIds && { allowIds }),
      onProgress: (n) => progress.update(n),
    });
    progress.finish(`${recipes.length.toLocaleString("pt-BR")} receitas carregadas`);

    if (recipes.length === 0) {
      console.warn("[ingest] nada para ingerir — verifique o arquivo/adapter");
      return;
    }
  }

  // Etapa 3 — conexão e deduplicação
  console.log("[db] conectando...");
  await connectDatabase();
  await waitForSearchIndexQueryable("ingredients", INGREDIENT_VECTOR_INDEX);

  const externalIds = recipes.map((r) => r.externalId).filter(Boolean) as string[];
  if (externalIds.length > 0) {
    console.log(`[dedupe] verificando ${externalIds.length.toLocaleString("pt-BR")} IDs no banco...`);
    const existing = await RecipeModel.findMany(
      { externalId: { $in: externalIds } } as never,
      { projection: { externalId: 1 } },
    );
    const done = new Set((existing as { externalId?: string }[]).map((r) => r.externalId));
    const before = recipes.length;
    recipes = recipes.filter((r) => !r.externalId || !done.has(r.externalId));
    const skipped = before - recipes.length;
    if (skipped > 0)
      console.log(`[dedupe] ${skipped.toLocaleString("pt-BR")} já processadas — pulando`);
  }

  if (recipes.length === 0) {
    console.log("[ingest] nada novo para ingerir");
    await disconnectDatabase();
    return;
  }

  console.log(`[ingest] ${recipes.length.toLocaleString("pt-BR")} receitas novas para processar`);

  // Etapa 4 — criação dos batches
  const totalBatches = Math.ceil(recipes.length / 100);
  progress.start("batches", totalBatches);

  // Etapa 5 — polling (começa quando todos os batches estiverem criados)
  let pollOk = 0, pollErr = 0, pollProc = 0, pollPending = 0;

  try {
    const report = await runBatchIngestion(recipes, {
      source,
      checkpointPath,

      onBatchCreated: (index, total, batchId) => {
        progress.update(index, `último: ${batchId}`);
        if (index === total) {
          // Todos os batches criados — muda para modo polling
          progress.finish(`${total} batch(es) enviados à Anthropic`);
          progress.start("aguardando");
          progress.update(0, "verificando a cada 30s...");
        }
      },

      onPollUpdate: (ok, errored, processing, pending) => {
        pollOk = ok; pollErr = errored; pollProc = processing; pollPending = pending;
        progress.update(
          ok + errored,
          `ok:${ok.toLocaleString("pt-BR")}  erro:${errored}  processando:${processing}  batches ativos:${pending}`,
        );
      },
    });

    progress.finish(
      `concluído — ${report.succeeded.toLocaleString("pt-BR")} receitas salvas` +
        (report.failed.length > 0 ? `, ${report.failed.length} falhas` : ""),
    );

    if (report.failed.length > 0) {
      console.log(`[ingest] primeiras falhas:`);
      for (const f of report.failed.slice(0, 10)) {
        console.log(`  - ${f.customId}: ${f.reason}`);
      }
    }
  } catch (err) {
    if (err instanceof CreditExhaustedError) {
      process.stdout.write("\n");
      console.error("[ingest] Crédito insuficiente — progresso salvo em:");
      console.error(`  ${err.checkpointPath ?? "(sem checkpoint)"}`);
      console.error("[ingest] Após recarregar créditos, retome com:");
      if (err.checkpointPath) {
        console.error(`  npm run ingest:dataset -- --resume ${err.checkpointPath}`);
      }
      process.exit(1);
    }
    throw err;
  } finally {
    await disconnectDatabase();
  }

  // Suprime warning de variáveis não usadas (valores lidos via closure no callback)
  void pollOk; void pollErr; void pollProc; void pollPending;
}

main().catch((err) => {
  console.error("[ingest] falhou:", err);
  process.exit(1);
});
