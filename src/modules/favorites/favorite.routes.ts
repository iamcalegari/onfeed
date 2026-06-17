import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import {
  addFavorite,
  listFavoriteRecipeIds,
  listFavoriteRecipes,
  removeFavorite,
} from "./favorite.repository.js";

/** Favoritos por usuário (todas as rotas exigem login). */
export const favoriteRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get("/favorites", { preHandler: requireAuth }, async (request) => {
    const userId = getUserId(request)!;
    return { recipes: await listFavoriteRecipes(userId) };
  });

  // só os ids — o front usa pra marcar o coração nos cards
  app.get("/favorites/ids", { preHandler: requireAuth }, async (request) => {
    const userId = getUserId(request)!;
    return { ids: await listFavoriteRecipeIds(userId) };
  });

  app.post(
    "/favorites",
    {
      preHandler: requireAuth,
      schema: { body: Type.Object({ recipeId: Type.String() }) },
    },
    async (request) => {
      await addFavorite(getUserId(request)!, request.body.recipeId);
      return { ok: true };
    },
  );

  app.delete(
    "/favorites/:recipeId",
    {
      preHandler: requireAuth,
      schema: { params: Type.Object({ recipeId: Type.String() }) },
    },
    async (request) => {
      await removeFavorite(getUserId(request)!, request.params.recipeId);
      return { ok: true };
    },
  );
};
