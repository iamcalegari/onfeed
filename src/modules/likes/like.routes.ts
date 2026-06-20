import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { getLikeCount, getUserLiked, toggleLike } from "./like.repository.js";

export const likeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Público — liked=false se não autenticado
  app.get(
    "/recipes/:id/likes",
    { schema: { params: Type.Object({ id: Type.String() }) } },
    async (request) => {
      const { id: recipeId } = request.params;
      const userId = getUserId(request);
      const [count, liked] = await Promise.all([
        getLikeCount(recipeId),
        userId ? getUserLiked(userId, recipeId) : false,
      ]);
      return { count, liked };
    },
  );

  // Requer login — toggle
  app.post(
    "/recipes/:id/like",
    {
      preHandler: requireAuth,
      schema: { params: Type.Object({ id: Type.String() }) },
    },
    async (request) => {
      const userId = getUserId(request)!;
      const { id: recipeId } = request.params;
      return toggleLike(userId, recipeId);
    },
  );
};
