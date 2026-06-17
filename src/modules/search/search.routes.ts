import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyPluginAsync } from "fastify";

import { searchRecipes } from "./search.service.js";
import { SearchRequestSchema, SearchResponseSchema } from "./search.dto.js";

/**
 * Rotas do domínio de busca. Registradas como plugin Fastify isolado —
 * cada domínio expõe seu próprio plugin, sem framework por cima.
 */
export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.post(
    "/search",
    {
      schema: {
        tags: ["search"],
        body: SearchRequestSchema,
        response: { 200: SearchResponseSchema },
      },
    },
    async (request) => {
      return searchRecipes(request.body);
    },
  );
};
