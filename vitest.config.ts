import path from "node:path";

import { defineConfig } from "vitest/config";

// Convenção do projeto: testes lentos/binários/de rede usam o sufixo
// `.integration.test.ts` (ex.: yt-dlp/ffmpeg reais). Esses arquivos ficam
// de fora da suite rápida (`npm run test`) e só rodam via `npm run test:all`.
export default defineConfig({
  resolve: {
    alias: {
      // Espelha o path alias @/ do tsconfig.json (Vitest não lê tsc-alias).
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
