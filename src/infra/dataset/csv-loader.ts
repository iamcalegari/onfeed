import { createReadStream } from "node:fs";

import { parse } from "csv-parse";

import type { IngestRecipeInput } from "@/modules/recipes/recipe.ingestion.js";
import type { DatasetAdapter, DatasetRow } from "./dataset.adapter.js";

export interface LoadOptions {
  /** máximo de receitas a coletar (a Batches API aceita até 100k por lote) */
  limit?: number;
  /**
   * Amostragem distribuída: em vez das primeiras `limit`, pega `limit` receitas
   * uniformemente ao longo do arquivo inteiro (reservoir sampling). Dá variedade
   * real — datasets costumam vir ordenados (alfabético/por id), então as
   * "primeiras N" são enviesadas. Lê o arquivo todo (streaming), mas só guarda N.
   */
  sample?: boolean;
}

/**
 * Lê um CSV grande em streaming e mapeia cada linha via adapter. Sem `sample`,
 * para assim que `limit` é atingido (rápido). Com `sample`, varre o arquivo todo
 * e devolve uma amostra uniforme de `limit` receitas.
 */
export async function loadRecipesFromCsv(
  filePath: string,
  adapter: DatasetAdapter,
  opts: LoadOptions = {},
): Promise<IngestRecipeInput[]> {
  const limit = opts.limit ?? Infinity;

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true, // primeira linha = header; cada row vira objeto
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }),
  );

  // amostragem distribuída (algoritmo R de reservoir sampling)
  if (opts.sample && Number.isFinite(limit)) {
    const reservoir: IngestRecipeInput[] = [];
    let seen = 0; // índice (0-based) entre as receitas válidas já vistas
    for await (const row of parser as AsyncIterable<DatasetRow>) {
      const mapped = adapter(row);
      if (!mapped) continue;
      if (reservoir.length < limit) {
        reservoir.push(mapped);
      } else {
        const j = Math.floor(Math.random() * (seen + 1));
        if (j < limit) reservoir[j] = mapped;
      }
      seen++;
    }
    return reservoir;
  }

  // caminho rápido: as primeiras `limit` receitas válidas
  const out: IngestRecipeInput[] = [];
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
