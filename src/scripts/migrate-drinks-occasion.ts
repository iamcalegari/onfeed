/**
 * Marca receitas de bebida com occasions: ["drinks"].
 *
 * Uso:
 *   npx tsx src/scripts/migrate-drinks-occasion.ts
 *   npx tsx src/scripts/migrate-drinks-occasion.ts --dry-run
 */
import { connectDatabase, database } from "@/infra/database/connection.js";
import "../modules/index.js";

const DRY_RUN = process.argv.includes("--dry-run");

// Palavras-chave no título que indicam que a receita É uma bebida.
// Conservadoras — não incluem "cocktail" sozinho para não pegar "fruit cocktail pie".
const DRINK_TITLE_REGEX =
  /\b(smoothie|vitamina|batida|suco\b|juice\b|punch\b|lemonade|limonada|mojito|margarita|caipirinha|caipiroska|daiquiri|sangria|mimosa|milkshake|shake\b|frappuccino|lassi|kefir drink|agua fresca|horchata|tepache|kombucha|kefir|matcha latte|chai latte|cold brew)\b/i;

// Secundário: intro/description menciona "bebida" ou "drink" — filtra falsos-positivos.
const DRINK_INTRO_REGEX =
  /\b(bebida|drink\b|coquetel|suco|smoothie|vitamina|batida)\b/i;

async function run() {
  await connectDatabase();
  const col = database.getCollection("recipes")!;

  // Busca candidatos pelo título
  const candidates = await col
    .find(
      { title: DRINK_TITLE_REGEX },
      { projection: { _id: 1, title: 1, intro: 1, occasions: 1 } },
    )
    .toArray();

  console.log(`Candidatos encontrados: ${candidates.length}`);

  // Filtra: confirma com intro OU título muito claro (mojito, smoothie, etc.)
  const CLEAR_TITLE =
    /\b(smoothie|vitamina|batida|mojito|margarita|caipirinha|caipiroska|daiquiri|sangria|mimosa|milkshake|frappuccino)\b/i;

  const toTag = candidates.filter((r) => {
    const alreadyTagged = (r.occasions as string[] | undefined)?.includes("drinks");
    if (alreadyTagged) return false;
    const clearTitle = CLEAR_TITLE.test(r.title as string);
    const introConfirms = DRINK_INTRO_REGEX.test((r.intro as string) ?? "");
    return clearTitle || introConfirms;
  });

  console.log(`Para marcar com "drinks": ${toTag.length}`);
  toTag.forEach((r) => console.log(`  • ${r.title}`));

  if (DRY_RUN) {
    console.log("\n[dry-run] Nenhuma alteração aplicada.");
    process.exit(0);
  }

  if (toTag.length === 0) {
    console.log("Nada a fazer.");
    process.exit(0);
  }

  const ids = toTag.map((r) => r._id);
  const result = await col.updateMany(
    { _id: { $in: ids } },
    { $addToSet: { occasions: "drinks" } },
  );

  console.log(`\nRecipes atualizadas: ${result.modifiedCount}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
