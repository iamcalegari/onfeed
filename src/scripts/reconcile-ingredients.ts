/**
 * Reconcilia ingredientes `pending` com o catálogo canônico.
 *
 * Pendings nascem quando o fallback semântico da canonicalização não roda na
 * ingestão (tipicamente o vector index ainda "building"). Resultado: duplicatas
 * como `alho_picado` ("alho picado") em vez de casar com `alho`.
 *
 * MATCH SEGURO POR NÚCLEO: remove qualificadores de preparo/pontuação/conectores
 * do nome do pending e só mescla quando o NÚCLEO INTEIRO casa, como string, com
 * o displayName ou um sinônimo de um canônico real (curado). Exemplos:
 *
 *   "alho picado"     → núcleo "alho"            → casa com canônico `alho`   ✓
 *   "abacaxi em cubos"→ núcleo "abacaxi"         → casa com `abacaxi`         ✓
 *   "sopa de cogumelo"→ núcleo "sopa cogumelo"   → não casa nada → pending    ✓
 *   "tomate seco"     → núcleo "tomate seco"     → não casa nada → pending    ✓
 *
 * NÃO faz match por token solto: tokenizar e casar palavra a palavra contra
 * sinônimos (poluídos na ingestão) fundia coisas erradas — "sorvete"→suco,
 * "tofu"→coco, "damasco seco"→manga. Produtos derivados/compostos contêm o
 * token de um ingrediente base mas são OUTRA compra; só curadoria/LLM separa
 * esses com segurança, então ficam pending para revisão.
 *
 *   npm run reconcile:ingredients            (aplica)
 *   npm run reconcile:ingredients -- --dry   (só mostra o que faria)
 *
 * Idempotente.
 */
import {
  connectDatabase,
  database,
  disconnectDatabase,
} from "@/infra/database/connection.js";
import "@/modules/index.js";
import { IngredientModel } from "@/modules/ingredients/ingredient.model.js";
import type { CanonicalIngredient } from "@/modules/ingredients/ingredient.types.js";

const normalize = (text: string): string => text.toLowerCase().trim();

/**
 * Qualificadores de PREPARO físico — não mudam o ingrediente que se COMPRA
 * ("alho picado" e "alho" são a mesma compra). Deliberadamente NÃO inclui
 * "seco", "desidratado", "em pó", "defumado", "assado", "cozido", "congelado",
 * "fresco" — esses geram um produto diferente na prateleira.
 */
const PREP_WORDS = new Set([
  "picado", "picada", "picados", "picadas", "picadinho", "picadinha",
  "moido", "moida", "moidos", "moidas", "moído", "moída",
  "ralado", "ralada", "ralados", "raladas",
  "fatiado", "fatiada", "fatiados", "fatiadas", "fatias", "fatia",
  "triturado", "triturada", "amassado", "amassada",
  "cortado", "cortada", "cortados", "cortadas", "esmagado", "esmagada",
]);
const PREP_PHRASES = [
  "em cubos", "em rodelas", "em tiras", "em pedacos", "em pedaços",
  "em fatias", "cortado em", "picado em",
];
// conectores que sobram ao remover o preparo ("dente de alho" → "dente alho")
const STOP_WORDS = new Set(["de", "do", "da", "e", "em"]);

/** Remove qualificadores de preparo do nome; devolve o núcleo normalizado. */
function stripPrep(name: string): string {
  let s = normalize(name);
  for (const ph of PREP_PHRASES) s = s.split(ph).join(" ");
  const words = s
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0 && !PREP_WORDS.has(w) && !STOP_WORDS.has(w));
  return words.join(" ").trim();
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry") || process.argv.includes("--dry-run");
  await connectDatabase();

  const recipes = database.getCollection("recipes");
  const ingredientsCol = database.getCollection("ingredients");
  const all = (await IngredientModel.findMany({})) as CanonicalIngredient[];
  const canon = all.filter((i) => !i.pending);
  const pendings = all.filter((i) => i.pending);

  // displayName/sinônimo (normalizado) -> canônico não-pending
  const synToCanon = new Map<string, CanonicalIngredient>();
  const canonByDisplay = new Map<string, CanonicalIngredient>();
  for (const c of canon) {
    canonByDisplay.set(normalize(c.displayName), c);
    for (const syn of c.synonyms) synToCanon.set(normalize(syn), c);
  }
  const lookupCanon = (key: string): CanonicalIngredient | undefined =>
    canonByDisplay.get(key) ?? synToCanon.get(key);

  console.log(`${pendings.length} pendings${dry ? " (dry-run)" : ""}\n`);

  /** Mescla um pending no canônico `near`. Captura recipes/dry do escopo. */
  async function merge(
    p: CanonicalIngredient,
    near: CanonicalIngredient,
  ): Promise<boolean> {
    console.log(`  mesclar: ${p._id} → ${near._id}`);
    if (dry) return false;

    // 1. sinônimos + o próprio nome do pending vão para o canônico (casa direto
    //    em ingestões futuras, sem recair em pending).
    await IngredientModel.update(
      { _id: near._id },
      {
        $addToSet: { synonyms: { $each: [...p.synonyms, p.displayName] } },
        $set: { updatedAt: new Date() },
      },
    );
    // 2. receitas que referenciam o pending passam a apontar para o canônico
    const res = await recipes?.updateMany(
      { "ingredients.canonicalId": p._id },
      {
        $set: {
          "ingredients.$[e].canonicalId": near._id,
          "ingredients.$[e].isStaple": near.isStaple,
        },
      },
      { arrayFilters: [{ "e.canonicalId": p._id }] },
    );
    console.log(`      receitas atualizadas: ${res?.modifiedCount ?? 0}`);
    // 3. remove o pending duplicado (collection nativa: DELETE não está nos
    //    allowedMethods do Model)
    await ingredientsCol?.deleteOne({ _id: p._id } as never);
    return true;
  }

  let merged = 0;
  let kept = 0;
  for (const p of pendings) {
    const core = stripPrep(p.displayName);
    const hit = core ? lookupCanon(core) : undefined;
    if (hit && hit._id !== p._id) {
      if (await merge(p, hit)) merged++;
    } else {
      kept++;
    }
  }

  console.log(`\nconcluído: ${merged} mesclados, ${kept} mantidos para revisão.`);
  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[reconcile] falhou:", err);
  process.exit(1);
});
