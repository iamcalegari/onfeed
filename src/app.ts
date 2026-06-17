import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import {
  type TypeBoxTypeProvider,
  TypeBoxValidatorCompiler,
} from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";

import { recipeRoutes } from "@/modules/recipes/recipe.routes.js";
import { searchRoutes } from "@/modules/search/search.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Valida/serializa usando os schemas TypeBox das rotas.
  app.setValidatorCompiler(TypeBoxValidatorCompiler);

  await app.register(helmet);
  await app.register(cors, { origin: true });
  await app.register(sensible);

  app.get("/health", async () => ({ status: "ok" }));

  // Cada domínio = um plugin com seu prefixo.
  await app.register(searchRoutes, { prefix: "/api/v1" });
  await app.register(recipeRoutes, { prefix: "/api/v1" });

  return app;
}
