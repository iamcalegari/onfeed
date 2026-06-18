// A ordem dos imports é crítica: connection cria o Database singleton do mongoat
// antes que qualquer model tente se registrar.
import { connectDatabase } from "@/infra/database/connection.js";
import "@/modules/index.js";
import type { IngestJobMessage } from "@/infra/queue/ingest-job.types.js";
import { ingestRecipe } from "@/modules/recipes/recipe.ingestion.js";
import type { SQSEvent } from "aws-lambda";

// Conexão reutilizada entre invocações do mesmo container (Lambda warm start).
let dbConnected = false;

async function ensureDbConnected(): Promise<void> {
  if (dbConnected) return;
  await connectDatabase();
  dbConnected = true;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  await ensureDbConnected();

  // BatchSize=1 no trigger, mas iteramos para cobrir edge cases.
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as IngestJobMessage;
    console.log(
      `[lambda] job ${message.jobId} — "${message.input.title}" (source: ${message.opts.source})`,
    );

    const recipe = await ingestRecipe(message.input, message.opts);
    console.log(`[lambda] salvo: ${recipe._id as string} (job ${message.jobId})`);
  }
};
