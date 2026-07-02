/**
 * Backfill: troca a thumbnail de receitas importadas pela keyframe real do vídeo.
 *
 * Contexto: até o fix no pipeline (setThumbnail pós-keyframe), receitas
 * `source: "imported"` nasciam com thumbnailUrl vazio — o front então gerava
 * uma imagem por IA que não conhecia o prato (carbonara → sopa de ovo). O
 * keyframe correto sempre foi extraído e salvo no S3, com a URL gravada no
 * ImportJob. Este script propaga job.keyframeUrl → recipe.thumbnailUrl.
 *
 * Uso:
 *   yarn backfill:import-thumbnails            # dry-run
 *   APPLY=1 yarn backfill:import-thumbnails    # aplica
 */
import { ObjectId } from "mongodb";

import { connectDatabase, database } from "@/infra/database/connection.js";
import "../modules/index.js";

const APPLY = process.env.APPLY === "1";

async function run() {
  await connectDatabase();
  const recipes = database.getCollection("recipes");
  const jobs = database.getCollection("import_jobs");
  if (!recipes || !jobs) {
    throw new Error("Collections não encontradas — verifique se os models foram importados.");
  }

  const imported = await recipes
    .find(
      { source: "imported", importJobId: { $exists: true, $ne: "" } },
      { projection: { _id: 1, title: 1, thumbnailUrl: 1, importJobId: 1 } },
    )
    .toArray();

  console.log(`${imported.length} receitas importadas com importJobId.`);
  if (!APPLY) console.log("(dry-run — defina APPLY=1 para gravar)\n");

  let updated = 0;
  let skippedSame = 0;
  let missingKeyframe = 0;

  for (const recipe of imported) {
    const job = await jobs.findOne(
      { _id: new ObjectId(String(recipe.importJobId)) },
      { projection: { keyframeUrl: 1 } },
    );
    const keyframeUrl = job?.keyframeUrl as string | undefined;

    if (!keyframeUrl) {
      missingKeyframe++;
      console.log(`— sem keyframe: ${recipe._id} "${recipe.title}" (job ${recipe.importJobId})`);
      continue;
    }
    if (recipe.thumbnailUrl === keyframeUrl) {
      skippedSame++;
      continue;
    }

    console.log(`✓ ${recipe._id} "${recipe.title}"`);
    console.log(`    de:   ${recipe.thumbnailUrl || "(vazio)"}`);
    console.log(`    para: ${keyframeUrl}`);
    if (APPLY) {
      await recipes.updateOne(
        { _id: recipe._id },
        { $set: { thumbnailUrl: keyframeUrl, updatedAt: new Date() } },
      );
    }
    updated++;
  }

  console.log(
    `\n${APPLY ? "Atualizadas" : "A atualizar"}: ${updated} | já corretas: ${skippedSame} | sem keyframe: ${missingKeyframe}`,
  );
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
