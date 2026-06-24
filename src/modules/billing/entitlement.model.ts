import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

/** Plano do usuário. A fonte de verdade do "isPro" vive aqui, no servidor —
 * o localStorage do front é só projeção/UX, não pode ser a autoridade. */
export type Plan = "free" | "pro";

export interface Entitlement {
  _id?: string;
  userId: string;
  /** "free" | "pro" */
  plan: Plan;
  /** "active" | "canceled" — canceled preserva histórico sem dar acesso. */
  status: string;
  /** Fim do período pago. Ausente = sem expiração (ex: grant manual de admin). */
  currentPeriodEnd?: Date;
  /** Origem: "admin" (grant manual) | "stripe" (webhook) | "system". */
  source: string;
  insertedAt: Date;
  updatedAt: Date;
}

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "plan", "status", "source", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    plan: { bsonType: "string" },
    status: { bsonType: "string" },
    currentPeriodEnd: { bsonType: "date" },
    source: { bsonType: "string" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const EntitlementModel = new Model<Entitlement>({
  collectionName: "entitlements",
  schema,
  allowedMethods: [METHODS.UPDATE, METHODS.FIND],
  documentDefaults: {
    plan: "free",
    status: "active",
    source: "system",
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [{ key: { userId: 1 }, name: "user_unique", unique: true }],
});
