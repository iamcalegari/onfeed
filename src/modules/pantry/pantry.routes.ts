import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { addToPantry, getPantryItems, removeFromPantry } from "./pantry.repository.js";

export const pantryRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/pantry",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["pantry"],
        response: {
          200: Type.Object({
            items: Type.Array(
              Type.Object({
                ingredientId: Type.String(),
                displayName: Type.String(),
                category: Type.String(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const userId = getUserId(request)!;
      return { items: await getPantryItems(userId) };
    },
  );

  app.post(
    "/pantry/items",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["pantry"],
        body: Type.Object({ ingredientId: Type.String({ minLength: 1 }) }),
        response: { 200: Type.Object({ ok: Type.Boolean() }) },
      },
    },
    async (request) => {
      await addToPantry(getUserId(request)!, request.body.ingredientId);
      return { ok: true };
    },
  );

  app.delete(
    "/pantry/items/:ingredientId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["pantry"],
        params: Type.Object({ ingredientId: Type.String() }),
        response: { 200: Type.Object({ ok: Type.Boolean() }) },
      },
    },
    async (request) => {
      await removeFromPantry(getUserId(request)!, request.params.ingredientId);
      return { ok: true };
    },
  );
};
