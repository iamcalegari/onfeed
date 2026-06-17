/**
 * Reconcilia ingredientes `pending` com o catálogo canônico.
 *
 * Pendings nascem quando o fallback semântico da canonicalização não roda na
 * ingestão (tipicamente o vector index ainda "building"). Resultado: duplicatas
 * de nome composto como `macarrao_espaguete` ("macarrão espaguete") em vez de
 * casar com `macarrao`.
 *
 * O match aqui é DETERMINÍSTICO por token, não por embedding: o embedding não
 * separa bem os casos (matches certos ~0.75 ficam abaixo de falsos positivos
 * ~0.76). Em vez disso, tokenizamos o nome do pending e vemos quais sinônimos
 * canônicos ele contém. Só mesclamos quando os tokens apontam para EXATAMENTE
 * UM canônico — assim "macarrão espaguete"→macarrao casa, mas "sal e pimenta"
 * (aponta p/ sal E pimenta) e "banana"/"presunto" (apontam p/ nada) ficam
 * pending para revisão.
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

/** Quebra um nome em tokens normalizados (palavras), p/ casar com sinônimos. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3); // descarta "e", "de", "ao"...
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  await connectDatabase();

  const recipes = database.getCollection("recipes");
  const all = (await IngredientModel.findMany({})) as CanonicalIngredient[];
  const canon = all.filter((i) => !i.pending);
  const pendings = all.filter((i) => i.pending);

  // sinônimo (normalizado) -> canônico não-pending
  const synToCanon = new Map<string, CanonicalIngredient>();
  for (const c of canon) {
    for (const syn of c.synonyms) synToCanon.set(syn.toLowerCase().trim(), c);
  }

  console.log(`${pendings.length} pendings${dry ? " (dry-run)" : ""}\n`);

  let merged = 0;
  for (const p of pendings) {
    // Nome composto ("sal e pimenta") = vários ingredientes num só — não dá pra
    // mesclar num único canônico sem perder os outros. Fica pending p/ revisão.
    if (/\b(e|com|and|&)\b|,/.test(p.displayName.toLowerCase())) {
      console.log(`  mantém pending: ${p._id} — composto (vários ingredientes)`);
      continue;
    }

    // tokens do nome + sinônimos do pending que batem com algum sinônimo canônico
    const tokens = new Set([
      ...tokenize(p.displayName),
      ...p.synonyms.flatMap(tokenize),
    ]);
    const targets = new Map<string, CanonicalIngredient>();
    for (const tok of tokens) {
      const hit = synToCanon.get(tok);
      if (hit && hit._id !== p._id) targets.set(hit._id, hit);
    }

    if (targets.size !== 1) {
      const why = targets.size === 0 ? "sem canônico" : `ambíguo (${[...targets.keys()].join(", ")})`;
      console.log(`  mantém pending: ${p._id} — ${why}`);
      continue;
    }

    const near = [...targets.values()][0]!;
    console.log(`  mesclar: ${p._id} → ${near._id}`);
    if (dry) continue;

    // 1. sinônimos do pending vão para o canônico
    await IngredientModel.update(
      { _id: near._id },
      {
        $addToSet: { synonyms: { $each: p.synonyms } },
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

    // 3. remove o pending duplicado
    await IngredientModel.delete({ _id: p._id });
    merged++;
  }

  console.log(`\nconcluído: ${merged} mesclados, ${pendings.length - merged} mantidos.`);
  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[reconcile] falhou:", err);
  process.exit(1);
});
