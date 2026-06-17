import { env } from "@/config/env.js";
import { embeddings } from "@/infra/embeddings/voyage.client.js";
import {
  resolveCanonicalForIngestion,
  type ResolvedCanonical,
} from "@/modules/ingredients/ingredient.service.js";
import {
  extractRecipe,
  type ExtractedRecipe,
  type RawRecipeInput,
} from "./recipe.extraction.js";
import { RecipeModel } from "./recipe.model.js";
import type {
  Nutrition,
  Recipe,
  RecipeIngredient,
  RecipeSource,
  RecipeStep,
} from "./recipe.types.js";

export interface IngestRecipeInput extends RawRecipeInput {
  thumbnailUrl: string;
  /** opcional: se ausente, cai para a soma dos tempos dos passos extraídos */
  prepTimeMin?: number;
  servings: number;
  /** vem do dataset quando disponível (ver dimensão N) */
  nutrition?: Nutrition;
}

const DEFAULT_PREP_MIN = 30;

export interface IngestOptions {
  source: RecipeSource;
}

/**
 * Constrói o texto que vai ser embeddado. DEVE espelhar a "forma" do texto de
 * query montado no search.service — mesma estrutura, mesmo modelo (Voyage) —
 * senão o vetor da receita e o vetor da busca não vivem no mesmo espaço.
 */
function buildEmbeddingText(
  title: string,
  intro: string,
  country: string,
  occasions: string[],
  ingredients: RecipeIngredient[],
): string {
  return [
    title,
    `Cozinha: ${country}`,
    `Ocasiões: ${occasions.join(", ")}`,
    `Ingredientes: ${ingredients.map((i) => i.name).join(", ")}`,
    intro,
  ].join("\n");
}

/**
 * Pipeline completo de ingestão de UMA receita:
 *   extração (LLM) → canonicalização de cada ingrediente → embedding (Voyage)
 *   → persistência.
 *
 * Pensado para rodar num worker (SQS → Lambda): a receita pode entrar com
 * `source: "generated_pending"` e ser promovida após validação.
 */
export async function ingestRecipe(
  input: IngestRecipeInput,
  opts: IngestOptions,
): Promise<Recipe> {
  const extracted = await extractRecipe(input);
  return persistExtractedRecipe(input, extracted, opts);
}

/**
 * Fase pós-extração: canonicaliza ingredientes, embedda e persiste.
 * Compartilhada pelo caminho único (ingestRecipe) e pelo batch (Batches API,
 * onde a extração já aconteceu no lado da Anthropic).
 */
export async function persistExtractedRecipe(
  input: IngestRecipeInput,
  extracted: ExtractedRecipe,
  opts: IngestOptions,
): Promise<Recipe> {
  // Canonicaliza sequencialmente: o passo semântico pode criar/atualizar o
  // catálogo, então paralelizar arriscaria corridas em sinônimos novos.
  const ingredients: RecipeIngredient[] = [];
  for (const ing of extracted.ingredients) {
    const { canonicalId, isStaple } = await resolveCanonicalForIngestion(
      ing.name,
    );
    ingredients.push({
      raw: ing.raw,
      canonicalId,
      name: ing.name,
      core: ing.core,
      isStaple,
      ...(ing.quantity !== null && { quantity: ing.quantity }),
      ...(ing.unit !== null && { unit: ing.unit }),
    });
  }

  const embeddingText = buildEmbeddingText(
    input.title,
    extracted.intro,
    extracted.country,
    extracted.occasions,
    ingredients,
  );

  const [embedding] = await embeddings.embedDocuments([embeddingText]);
  if (!embedding) {
    throw new Error(`Voyage não retornou embedding para "${input.title}"`);
  }

  // passos estruturados + prepTime (dataset > soma dos passos > default)
  const { steps, prepTimeMin } = buildSteps(extracted, input.prepTimeMin);

  const recipe = await RecipeModel.insert({
    title: input.title,
    intro: extracted.intro,
    country: extracted.country,
    thumbnailUrl: input.thumbnailUrl,
    prepTimeMin,
    servings: input.servings,
    occasions: extracted.occasions,
    equipment: extracted.equipment,
    ingredients,
    steps,
    ...(input.nutrition && { nutrition: input.nutrition }),
    source: opts.source,
    embeddingText,
    embedding,
    embeddingModel: env.voyage.model,
    insertedAt: new Date(),
    updatedAt: new Date(),
  });

  return recipe as unknown as Recipe;
}

/** monta os passos + prepTime a partir da extração (compartilhado). */
function buildSteps(extracted: ExtractedRecipe, prepTimeMin?: number) {
  const steps: RecipeStep[] = extracted.steps.map((s) => ({
    text: s.text,
    ...(s.minutes !== null && { minutes: s.minutes }),
  }));
  const stepsTotal = steps.reduce((acc, s) => acc + (s.minutes ?? 0), 0);
  return {
    steps,
    prepTimeMin: prepTimeMin ?? (stepsTotal > 0 ? stepsTotal : DEFAULT_PREP_MIN),
  };
}

// Voyage aceita um array por request; embeddar em lotes evita 1 request por
// receita (o gargalo no free tier de 3 RPM). 128 fica bem abaixo dos limites.
const EMBED_CHUNK = 128;

/**
 * Persistência em LOTE (usada pela Batches API). Mesma lógica do
 * `persistExtractedRecipe`, mas otimizada para o gargalo do Voyage:
 *   1. canonicaliza cada nome de ingrediente ÚNICO uma só vez (dedupe entre
 *      todas as receitas — "alho"/"sal" se repetem muito);
 *   2. embedda as receitas em lotes (1 request por chunk, não 1 por receita);
 *   3. insere uma a uma (isola erro de validação por receita).
 *
 * Reduz as chamadas ao Voyage de O(receitas × ingredientes) para
 * O(ingredientes_novos_únicos + receitas/128).
 */
export async function persistExtractedRecipesBatch(
  items: { input: IngestRecipeInput; extracted: ExtractedRecipe }[],
  opts: IngestOptions,
): Promise<{ saved: Recipe[]; failed: { title: string; reason: string }[] }> {
  // 1. canonicaliza nomes únicos (sequencial — o fallback semântico aprende
  // sinônimos no catálogo, então paralelizar arriscaria corridas).
  const canon = new Map<string, ResolvedCanonical>();
  const uniqueNames = [
    ...new Set(
      items.flatMap((it) =>
        it.extracted.ingredients.map((i) => i.name.trim().toLowerCase()),
      ),
    ),
  ];
  console.log(
    `[ingest] canonicalizando ${uniqueNames.length} ingredientes únicos (dedupe de ${items.length} receitas)...`,
  );
  for (const name of uniqueNames) {
    canon.set(name, await resolveCanonicalForIngestion(name));
  }

  // 2. monta ingredientes + texto de embedding de cada receita
  const built = items.map(({ input, extracted }) => {
    const ingredients: RecipeIngredient[] = extracted.ingredients.map((ing) => {
      const c = canon.get(ing.name.trim().toLowerCase());
      return {
        raw: ing.raw,
        canonicalId: c?.canonicalId ?? ing.name.trim().toLowerCase(),
        name: ing.name,
        core: ing.core,
        isStaple: c?.isStaple ?? false,
        ...(ing.quantity !== null && { quantity: ing.quantity }),
        ...(ing.unit !== null && { unit: ing.unit }),
      };
    });
    const embeddingText = buildEmbeddingText(
      input.title,
      extracted.intro,
      extracted.country,
      extracted.occasions,
      ingredients,
    );
    return { input, extracted, ingredients, embeddingText };
  });

  // 3. embedda em lotes (1 request Voyage por chunk)
  const vectors: number[][] = [];
  for (let i = 0; i < built.length; i += EMBED_CHUNK) {
    const chunk = built.slice(i, i + EMBED_CHUNK);
    console.log(
      `[ingest] embeddando receitas ${i + 1}-${i + chunk.length}/${built.length}...`,
    );
    const vecs = await embeddings.embedDocuments(chunk.map((b) => b.embeddingText));
    vectors.push(...vecs);
  }

  // 4. insere (uma a uma, isolando erro por receita)
  const saved: Recipe[] = [];
  const failed: { title: string; reason: string }[] = [];
  const now = new Date();
  for (let i = 0; i < built.length; i++) {
    const b = built[i]!;
    const embedding = vectors[i];
    if (!embedding) {
      failed.push({ title: b.input.title, reason: "sem embedding" });
      continue;
    }
    const { steps, prepTimeMin } = buildSteps(b.extracted, b.input.prepTimeMin);
    try {
      const recipe = await RecipeModel.insert({
        title: b.input.title,
        intro: b.extracted.intro,
        country: b.extracted.country,
        thumbnailUrl: b.input.thumbnailUrl,
        prepTimeMin,
        servings: b.input.servings,
        occasions: b.extracted.occasions,
        equipment: b.extracted.equipment,
        ingredients: b.ingredients,
        steps,
        ...(b.input.nutrition && { nutrition: b.input.nutrition }),
        source: opts.source,
        embeddingText: b.embeddingText,
        embedding,
        embeddingModel: env.voyage.model,
        insertedAt: now,
        updatedAt: now,
      });
      saved.push(recipe as unknown as Recipe);
    } catch (err) {
      failed.push({
        title: b.input.title,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { saved, failed };
}
