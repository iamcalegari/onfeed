/**
 * Atualiza a definição do vector search index de `recipes` no Atlas para
 * incluir os filter fields atuais (D-14: visibility, createdBy.userId).
 *
 * Necessário porque `setup:db`/`setupSearchIndexes` só CRIAM índices ausentes —
 * nunca alteram um índice já existente. Um path de filtro não declarado no
 * índice é silenciosamente ignorado pelo $vectorSearch, o que quebraria o
 * owner-scoping (a busca de imports privados não filtraria por dono).
 *
 * Uso: npm run fix:search-index
 * O rebuild é assíncrono no Atlas (~minutos até ficar 'queryable').
 */
import { connectDatabase, disconnectDatabase } from "@/infra/database/connection.js";
import "@/modules/index.js";
import { updateRecipeVectorIndex } from "@/infra/database/search-indexes.js";

async function main() {
  await connectDatabase();
  try {
    await updateRecipeVectorIndex();
  } finally {
    await disconnectDatabase();
  }
}

void main();
