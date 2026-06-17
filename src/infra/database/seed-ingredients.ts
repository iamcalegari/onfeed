/**
 * Popular o catálogo canônico de ingredientes e embeddá-los, habilitando o
 * fallback semântico da canonicalização. Idempotente (upsert por _id).
 *
 * Rodar com: npm run seed:ingredients
 * Pré-requisito: npm run setup:db (coleções, validators e search indexes).
 */
import { embeddings } from "@/infra/embeddings/voyage.client.js";
import { IngredientModel } from "@/modules/ingredients/ingredient.model.js";
import { INGREDIENT_SEED } from "@/modules/ingredients/ingredient.seed-data.js";
import { connectDatabase, disconnectDatabase } from "./connection.js";
// Registra os models no mongoat.
import "@/modules/index.js";

async function main(): Promise<void> {
  await connectDatabase();
  console.log(`[seed] conectado. ${INGREDIENT_SEED.length} ingredientes.`);

  // Um texto de embedding por ingrediente: displayName + sinônimos ajudam o
  // match semântico (ex: "EVOO" cai perto de "Azeite de oliva").
  const texts = INGREDIENT_SEED.map(
    (i) => `${i.displayName}: ${i.synonyms.join(", ")}`,
  );
  const vectors = await embeddings.embedDocuments(texts);
  console.log(`[seed] ${vectors.length} embeddings calculados (Voyage).`);

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < INGREDIENT_SEED.length; i++) {
    const seed = INGREDIENT_SEED[i]!;
    const embedding = vectors[i]!;
    const now = new Date();

    const exists = await IngredientModel.findById(seed._id);
    if (exists) {
      await IngredientModel.update(
        { _id: seed._id },
        {
          $set: {
            displayName: seed.displayName,
            synonyms: seed.synonyms,
            category: seed.category,
            isStaple: seed.isStaple,
            pending: false,
            embedding,
            updatedAt: now,
          },
        },
      );
      updated++;
    } else {
      await IngredientModel.insert({
        _id: seed._id,
        displayName: seed.displayName,
        synonyms: seed.synonyms,
        category: seed.category,
        isStaple: seed.isStaple,
        pending: false,
        embedding,
        insertedAt: now,
        updatedAt: now,
      });
      inserted++;
    }
  }

  console.log(`[seed] concluído: ${inserted} inseridos, ${updated} atualizados.`);
  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[seed] falhou:", err);
  process.exit(1);
});
