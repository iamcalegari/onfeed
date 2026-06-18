import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "node:crypto";

import { env } from "@/config/env.js";
import type {
  IngestOptions,
  IngestRecipeInput,
} from "@/modules/recipes/recipe.ingestion.js";
import type { IngestJobMessage } from "./ingest-job.types.js";
import { sqsClient } from "./sqs.client.js";

export async function enqueueIngestJob(
  input: IngestRecipeInput,
  opts: IngestOptions,
): Promise<string> {
  const jobId = randomUUID();
  const message: IngestJobMessage = { jobId, input, opts };

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: env.sqs.queueUrl,
      MessageBody: JSON.stringify(message),
    }),
  );

  return jobId;
}
