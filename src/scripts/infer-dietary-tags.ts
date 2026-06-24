/**
 * Infere tags dietéticas para receitas existentes usando regras sobre nomes dos ingredientes.
 * Receitas já com dietaryTags são ignoradas (idempotente).
 *
 * Uso:
 *   npx tsx src/scripts/infer-dietary-tags.ts
 *   npx tsx src/scripts/infer-dietary-tags.ts --dry-run
 */
import { ObjectId } from "mongodb";
import { connectDatabase, database } from "@/infra/database/connection.js";
import "../modules/index.js";
import type { DietaryTag } from "../modules/recipes/recipe.types.js";

const DRY_RUN = process.argv.includes("--dry-run");

/* ── Listas de ingredientes que DESCLASSIFICAM uma tag ──────── */

// Ingredientes que contêm glúten (fonte de trigo/centeio/cevada)
const GLUTEN_RE = /\b(farinha de trigo|trigo|centeio|cevada|seitan|glúten|semolina|sêmola|spelt|farro)\b/i;

// Carnes e frutos do mar — desclassifica "vegetariano" e "vegano"
const MEAT_RE =
  /\b(frango|peito de frango|sobrecoxa|coxinha de frango|carne\b|carne moída|carne bovina|carne suína|porco|leitão|peixe|camarão|lagosta|caranguejo|mariscos?|mexilhão|ostras?|polvo|lula|atum|salmão|sardinha|bacalhau|tilápia|merluza|truta|anchova|presunto|bacon|toucinho|linguiça|salsicha|mortadela|paio|copa|calabresa|peperoni|costela|alcatra|picanha|pernil|filé( mignon)?|lombo|bisteca|bife|chester|peru|pato|cordeiro|vitela|coelho|javali|caça\b|frutos do mar)\b/i;

// Laticínios — desclassifica "vegano" e "sem lactose"
const DAIRY_RE =
  /\b(leite\b|leite condensado|leite em pó|queijo|manteiga|ghee|creme de leite|iogurte|nata|requeijão|ricota|mussarela|mozzarella|parmesão|parmesan|gruyère|gruyere|emmental|brie|camembert|gorgonzola|cream cheese|mascarpone|cheddar|cottage)\b/i;

// Ovos — desclassifica "vegano"
const EGG_RE = /\b(ovo|ovos|clara de ovo|gema|clara\b)\b/i;

// Açúcares adicionados — desclassifica "sem açúcar"
const SUGAR_RE = /\b(açúcar|açucar|açúcar refinado|açúcar cristal|açúcar mascavo|açúcar demerara|açúcar de coco|mel\b|xarope de|calda de açúcar|glacê|glace)\b/i;

/* ── Inferência para uma lista de nomes de ingredientes ──────── */

function inferTags(ingredientNames: string[]): DietaryTag[] {
  const joined = ingredientNames.join("\n").toLowerCase();

  const hasGluten   = GLUTEN_RE.test(joined);
  const hasMeat     = MEAT_RE.test(joined);
  const hasDairy    = DAIRY_RE.test(joined);
  const hasEgg      = EGG_RE.test(joined);
  const hasSugar    = SUGAR_RE.test(joined);

  const tags: DietaryTag[] = [];

  if (!hasGluten)                  tags.push("gluten_free");
  if (!hasMeat)                    tags.push("vegetarian");
  if (!hasMeat && !hasDairy && !hasEgg) tags.push("vegan");
  if (!hasDairy)                   tags.push("lactose_free");
  if (!hasSugar)                   tags.push("sugar_free");

  return tags;
}

/* ── Main ───────────────────────────────────────────────────── */

async function run() {
  await connectDatabase();
  const col = database.getCollection("recipes")!;

  // Só processa receitas sem dietaryTags (idempotente)
  const total = await col.countDocuments({ dietaryTags: { $exists: false } });
  console.log(`Receitas sem dietaryTags: ${total}`);
  if (total === 0) { console.log("Nada a fazer."); process.exit(0); }

  const cursor = col.find(
    { dietaryTags: { $exists: false } },
    { projection: { _id: 1, title: 1, "ingredients.name": 1 } },
  );

  let processed = 0, updated = 0;
  const ops: { id: ObjectId; tags: DietaryTag[] }[] = [];

  for await (const doc of cursor) {
    const names = ((doc.ingredients as { name: string }[]) ?? []).map((i) => i.name);
    const tags  = inferTags(names);
    ops.push({ id: doc._id as ObjectId, tags });
    processed++;
  }

  console.log(`\nDistribuição de tags:`);
  for (const tag of ["gluten_free", "vegetarian", "vegan", "lactose_free", "sugar_free"] as DietaryTag[]) {
    const count = ops.filter(o => o.tags.includes(tag)).length;
    console.log(`  ${tag}: ${count} (${((count / processed) * 100).toFixed(1)}%)`);
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] Nenhuma alteração aplicada.");
    process.exit(0);
  }

  // BulkWrite para atualizar em lote (mais eficiente que update individual)
  const BATCH = 500;
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = ops.slice(i, i + BATCH);
    await col.bulkWrite(
      batch.map((o) => ({
        updateOne: {
          filter: { _id: o.id },
          update: { $set: { dietaryTags: o.tags, updatedAt: new Date() } },
        },
      })),
    );
    updated += batch.length;
    process.stdout.write(`\r  ${updated}/${processed} atualizadas…`);
  }

  console.log(`\n\nConcluído: ${updated} receitas atualizadas.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
