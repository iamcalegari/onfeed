import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

export interface AdaptUsage {
  _id?: string;
  userId: string;
  day: string; // YYYY-MM-DD (UTC)
  count: number;
  insertedAt: Date;
  updatedAt: Date;
}

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "day", "count", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    day: { bsonType: "string" },
    count: { bsonType: "number" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const AdaptUsageModel = new Model<AdaptUsage>({
  collectionName: "adapt_usage",
  schema,
  allowedMethods: [METHODS.UPDATE, METHODS.FIND],
  documentDefaults: {
    count: 0,
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [
    { key: { userId: 1, day: 1 }, name: "user_day_unique", unique: true },
  ],
});
