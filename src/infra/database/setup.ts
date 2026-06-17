/**
 * Script idempotente de provisionamento do banco:
 *   1. conecta
 *   2. cria coleções + aplica $jsonSchema validators + índices comuns (mongoat)
 *   3. cria o Atlas Vector Search index (driver nativo)
 *
 * Rodar com: npm run setup:db
 */
import { connectDatabase, database, disconnectDatabase } from "./connection.js";
import { setupSearchIndexes } from "./search-indexes.js";
// Registra os models antes de setupCollections().
import "@/modules/index.js";

async function main(): Promise<void> {
  await connectDatabase();
  console.log("[setup] conectado ao Atlas.");

  await database.setupCollections();
  console.log("[setup] coleções, validators e índices comuns prontos.");

  await setupSearchIndexes();
  console.log("[setup] vector search index solicitado.");

  await disconnectDatabase();
  console.log("[setup] concluído.");
}

main().catch((err) => {
  console.error("[setup] falhou:", err);
  process.exit(1);
});
