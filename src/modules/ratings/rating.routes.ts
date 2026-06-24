import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { getRatingStats, rateRecipe } from "./rating.repository.js";

export const ratingRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Público — mine=null se não autenticado
  app.get(
    "/recipes/:id/rating",
    { schema: { params: Type.Object({ id: Type.String() }) } },
    async (request) => {
      const { id: recipeId } = request.params;
      const userId = getUserId(request);
      return getRatingStats(recipeId, userId ?? undefined);
    },
  );

  // Requer login — avalia (upsert). rating 1..5
  app.post(
    "/recipes/:id/rate",
    {
      preHandler: requireAuth,
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          rating: Type.Integer({ minimum: 1, maximum: 5 }),
        }),
      },
    },
    async (request) => {
      const userId = getUserId(request)!;
      const { id: recipeId } = request.params;
      return rateRecipe(userId, recipeId, request.body.rating);
    },
  );
};
