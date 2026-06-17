import { embeddings } from "@/infra/embeddings/voyage.client.js";
import { IngredientModel } from "./ingredient.model.js";
import {
  createPendingIngredient,
  findNearestIngredient,
} from "./ingredient.repository.js";
import { expandWithSubstitutes } from "./ingredient.substitutions.js";

/**
 * Resolve termos digitados pelo usuário ("azeite", "tomate") para canonicalIds.
 *
 * Caminho rápido (este arquivo): match exato contra `synonyms` (já indexado).
 * Caminho de fallback (na ingestão, ver pipeline de normalização): embedda o
 * termo desconhecido e busca o ingrediente canônico mais próximo, aprendendo o
 * sinônimo. Em tempo de busca preferimos o caminho determinístico e barato;
 * termos não resolvidos são devolvidos como `unresolved` para feedback na UI.
 */
export interface ResolveResult {
  haveIds: string[];
  unresolved: string[];
}

export async function resolveUserIngredients(
  rawTerms: string[],
): Promise<ResolveResult> {
  const normalized = [
    ...new Set(rawTerms.map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ];
  if (normalized.length === 0) return { haveIds: [], unresolved: [] };

  const matches = await IngredientModel.findMany(
    { synonyms: { $in: normalized } },
    { projection: { _id: 1, synonyms: 1 } },
  );

  const termToId = new Map<string, string>();
  for (const ing of matches) {
    for (const syn of ing.synonyms) {
      if (normalized.includes(syn)) termToId.set(syn, ing._id);
    }
  }

  // expande com substitutos: ter óleo "cobre" uma receita que pede azeite
  const haveIds = expandWithSubstitutes([...new Set([...termToId.values()])]);
  const unresolved = normalized.filter((t) => !termToId.has(t));

  return { haveIds, unresolved };
}

/** acima deste score de similaridade, um termo novo é tratado como sinônimo */
const SEMANTIC_MATCH_THRESHOLD = 0.82;

export interface ResolvedCanonical {
  canonicalId: string;
  isStaple: boolean;
}

/**
 * Resolução em tempo de INGESTÃO (mais cara, tolera latência):
 *   1. match exato por sinônimo
 *   2. fallback semântico — embedda o termo, busca o canônico mais próximo;
 *      se passar do threshold, aprende o termo como sinônimo permanente
 *   3. termo genuinamente novo → cria entrada `pending` para revisão
 *
 * O passo 2 faz o catálogo se auto-enriquecer: cada termo desconhecido vira um
 * sinônimo, então o passo 1 (barato) cobre cada vez mais casos ao longo do tempo.
 */
export async function resolveCanonicalForIngestion(
  name: string,
): Promise<ResolvedCanonical> {
  const norm = name.trim().toLowerCase();

  const exact = await IngredientModel.find({ synonyms: norm });
  if (exact) return { canonicalId: exact._id, isStaple: exact.isStaple };

  const vec = await embeddings.embedQuery(norm);
  // o vector index de ingredientes pode ainda estar "building" no Atlas; nesse
  // caso o fallback semântico falha e a gente apenas cria um pending.
  let near: Awaited<ReturnType<typeof findNearestIngredient>> = null;
  try {
    near = await findNearestIngredient(vec);
  } catch {
    near = null;
  }
  if (near && near.score >= SEMANTIC_MATCH_THRESHOLD) {
    await IngredientModel.update(
      { _id: near._id },
      { $addToSet: { synonyms: norm }, $set: { updatedAt: new Date() } },
    );
    return { canonicalId: near._id, isStaple: near.isStaple };
  }

  const created = await createPendingIngredient(name, vec);
  return { canonicalId: created._id, isStaple: created.isStaple };
}
