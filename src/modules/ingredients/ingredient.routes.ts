import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { IngredientModel } from "./ingredient.model.js";

/** Busca de ingredientes canônicos — usada pelo autocomplete da despensa. */
export const ingredientRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/ingredients/search",
    {
      schema: {
        tags: ["ingredients"],
        querystring: Type.Object({ q: Type.String({ minLength: 1 }) }),
        response: {
          200: Type.Object({
            results: Type.Array(
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
      const q = request.query.q.trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const ingredients = await IngredientModel.findMany(
        { pending: false, $or: [{ displayName: regex }, { synonyms: regex }] } as never,
        { projection: { displayName: 1, category: 1 }, limit: 10 } as never,
      );
      return {
        results: ingredients.map((i) => ({
          ingredientId: i._id as string,
          displayName: i.displayName,
          category: i.category,
        })),
      };
    },
  );
};
