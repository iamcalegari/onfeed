import { clerkPlugin } from "@clerk/fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import {
  type TypeBoxTypeProvider,
  TypeBoxValidatorCompiler,
} from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";

import { env } from "@/config/env.js";
import { authRoutes } from "@/modules/auth/auth.routes.js";
import { favoriteRoutes } from "@/modules/favorites/favorite.routes.js";
import { ingredientRoutes } from "@/modules/ingredients/ingredient.routes.js";
import { likeRoutes } from "@/modules/likes/like.routes.js";
import { ratingRoutes } from "@/modules/ratings/rating.routes.js";
import { pantryRoutes } from "@/modules/pantry/pantry.routes.js";
import { recipeRoutes } from "@/modules/recipes/recipe.routes.js";
import { searchRoutes } from "@/modules/search/search.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Valida/serializa usando os schemas TypeBox das rotas.
  app.setValidatorCompiler(TypeBoxValidatorCompiler);

  await app.register(helmet);
  await app.register(cors, { origin: env.http.corsOrigin, credentials: true });
  await app.register(sensible);

  // Protege contra abuso e segura custo (cada busca = Voyage; adapt = Claude).
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  // Clerk: lê o token (cookie/Bearer) e disponibiliza getAuth(req) nas rotas.
  // Só registra se configurado — sem chaves, getUserId() devolve null.
  if (env.clerk.enabled) {
    await app.register(clerkPlugin, {
      secretKey: env.clerk.secretKey,
      publishableKey: env.clerk.publishableKey,
    });
  }

  app.get("/health", async () => ({ status: "ok" }));

  // Cada domínio = um plugin com seu prefixo.
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(searchRoutes, { prefix: "/api/v1" });
  await app.register(recipeRoutes, { prefix: "/api/v1" });
  await app.register(favoriteRoutes, { prefix: "/api/v1" });
  await app.register(ingredientRoutes, { prefix: "/api/v1" });
  await app.register(pantryRoutes, { prefix: "/api/v1" });
  await app.register(likeRoutes,   { prefix: "/api/v1" });
  await app.register(ratingRoutes, { prefix: "/api/v1" });

  return app;
}
