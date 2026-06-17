/**
 * Diagnóstico rápido do estado do banco: contagens, fontes e status dos
 * search indexes (vector). Útil quando a busca volta vazia.
 *
 *   npm run db:status
 */
import {
  connectDatabase,
  database,
  disconnectDatabase,
} from "@/infra/database/connection.js";
import "@/modules/index.js";

async function main(): Promise<void> {
  await connectDatabase();

  const ingredients = database.getCollection("ingredients");
  const recipes = database.getCollection("recipes");

  const ingCount = (await ingredients?.countDocuments()) ?? 0;
  const recCount = (await recipes?.countDocuments()) ?? 0;

  console.log(`\ningredients: ${ingCount}`);
  console.log(`recipes:     ${recCount}`);

  if (recCount > 0 && recipes) {
    const bySource = await recipes
      .aggregate([{ $group: { _id: "$source", n: { $sum: 1 } } }])
      .toArray();
    console.log("recipes por source:", bySource);
  }

  for (const name of ["recipes", "ingredients"]) {
    const col = database.getCollection(name);
    const idx = (await col?.listSearchIndexes().toArray()) ?? [];
    console.log(
      `search indexes [${name}]:`,
      idx.map((i) => ({
        name: i.name,
        status: i.status,
        queryable: i.queryable,
      })),
    );
  }

  if (ingCount > 0 && ingredients) {
    const sample = await ingredients
      .find({}, { projection: { _id: 1, synonyms: 1 } })
      .limit(3)
      .toArray();
    console.log("amostra de ingredientes:", JSON.stringify(sample));
  }

  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[db:status] falhou:", err);
  process.exit(1);
});
