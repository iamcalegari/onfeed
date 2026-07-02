import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

import type { ImportJob } from "./import-job.types.js";

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "sourceUrl", "normalizedUrl", "platform", "status", "retryCount", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    sourceUrl: { bsonType: "string" },
    normalizedUrl: { bsonType: "string" },
    platform: { bsonType: "string", enum: ["instagram", "tiktok", "youtube"] },
    status: {
      bsonType: "string",
      enum: ["queued", "downloading", "transcribing", "extracting", "ready_for_review", "failed"],
    },
    failedStep: { bsonType: "string" },
    failureReason: { bsonType: "string" },
    errorMessage: { bsonType: "string" },
    transcript: { bsonType: "string" },
    transcriptSource: { bsonType: ["string", "null"] },
    noSpeechDetected: { bsonType: "bool" },
    caption: { bsonType: "string" },
    sourceMeta: {
      bsonType: "object",
      properties: {
        authorHandle: { bsonType: "string" },
        authorUrl: { bsonType: "string" },
        durationSec: { bsonType: "number" },
      },
    },
    keyframeUrl: { bsonType: "string" },
    costCents: {
      bsonType: "object",
      properties: {
        download: { bsonType: "number" },
        transcription: { bsonType: "number" },
        total: { bsonType: "number" },
      },
    },
    retryCount: { bsonType: "number" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const ImportJobModel = new Model<ImportJob>({
  collectionName: "import_jobs",
  schema,
  allowedMethods: [
    METHODS.FIND,
    METHODS.FIND_BY_ID,
    METHODS.INSERT,
    METHODS.UPDATE,
  ],
  documentDefaults: {
    status: "queued",
    retryCount: 0,
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [
    // consultas do worker/painel por estado do pipeline
    { key: { status: 1 }, name: "status_lookup" },
    // GET /import/:jobId (ownership) e futuras listagens por usuário
    { key: { userId: 1 }, name: "user_lookup" },
  ],
});
