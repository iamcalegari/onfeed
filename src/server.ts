import { env } from "@/config/env.js";
// IMPORTANTE: connection cria o `new Database()` que o mongoat injeta nos models
// (Model.setDatabase). Tem que ser avaliado ANTES de qualquer model — por isso
// vem antes de @/app.js (que importa as rotas → models) e de @/modules/index.js.
import {
  connectDatabase,
  disconnectDatabase,
} from "@/infra/database/connection.js";
// Registra os models no mongoat (efeito de import).
import "@/modules/index.js";
import { buildApp } from "@/app.js";

async function main(): Promise<void> {
  await connectDatabase();

  const app = await buildApp();

  await app.listen({ port: env.http.port, host: env.http.host });

  const shutdown = async (signal: string) => {
    app.log.info(`Recebido ${signal}, encerrando...`);
    await app.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Falha no boot:", err);
  process.exit(1);
});
