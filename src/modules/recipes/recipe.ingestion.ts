import { env } from "@/config/env.js";
import { embeddings } from "@/infra/embeddings/voyage.client.js";
import { resolveCanonicalForIngestion } from "@/modules/ingredients/ingredient.service.js";
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

  // passos estruturados vêm da extração (texto limpo + tempo estimado)
  const steps: RecipeStep[] = extracted.steps.map((s) => ({
    text: s.text,
    ...(s.minutes !== null && { minutes: s.minutes }),
  }));

  // prepTime: dataset > soma dos passos > default
  const stepsTotal = steps.reduce((acc, s) => acc + (s.minutes ?? 0), 0);
  const prepTimeMin =
    input.prepTimeMin ?? (stepsTotal > 0 ? stepsTotal : DEFAULT_PREP_MIN);

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
