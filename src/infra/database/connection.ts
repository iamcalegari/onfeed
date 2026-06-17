import { Database } from "@iamcalegari/mongoat";

import { env } from "@/config/env.js";

/**
 * Instância única do Database do mongoat.
 *
 * O mongoat mantém um mapa estático de models e injeta este Database no Model
 * base (Model.setDatabase) no primeiro `new Database(...)`. Por isso há apenas
 * uma instância em toda a aplicação.
 */
export const database = new Database({
  uri: env.mongo.uri,
  username: env.mongo.username,
  password: env.mongo.password,
  dbName: env.mongo.dbName,
  ignoreUndefined: true,
});

let connected = false;

export async function connectDatabase(): Promise<void> {
  if (connected) return;
  await database.connect();
  connected = true;
}

export async function disconnectDatabase(): Promise<void> {
  if (!connected) return;
  await database.disconnect();
  connected = false;
}
