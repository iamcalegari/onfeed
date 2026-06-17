import { createReadStream } from "node:fs";

import { parse } from "csv-parse";

import type { IngestRecipeInput } from "@/modules/recipes/recipe.ingestion.js";
import type { DatasetAdapter, DatasetRow } from "./dataset.adapter.js";

export interface LoadOptions {
  /** máximo de receitas a coletar (a Batches API aceita até 100k por lote) */
  limit?: number;
}

/**
 * Lê um CSV grande em streaming e mapeia cada linha via adapter. Para assim que
 * `limit` é atingido, sem ter carregado o arquivo todo na memória.
 */
export async function loadRecipesFromCsv(
  filePath: string,
  adapter: DatasetAdapter,
  opts: LoadOptions = {},
): Promise<IngestRecipeInput[]> {
  const out: IngestRecipeInput[] = [];
  const limit = opts.limit ?? Infinity;

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true, // primeira linha = header; cada row vira objeto
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }),
  );

  for await (const row of parser as AsyncIterable<DatasetRow>) {
    const mapped = adapter(row);
    if (mapped) out.push(mapped);
    if (out.length >= limit) {
      parser.destroy();
      break;
    }
  }

  return out;
}
