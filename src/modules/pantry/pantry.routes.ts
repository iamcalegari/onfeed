import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { anthropic, EXTRACTION_MODEL } from "@/infra/llm/anthropic.client.js";
import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { IngredientModel } from "@/modules/ingredients/ingredient.model.js";
import { addToPantry, getPantryItems, removeFromPantry } from "./pantry.repository.js";

const RECEIPT_PROMPT = `Analise esta nota fiscal de supermercado brasileiro e extraia os itens que são ingredientes alimentícios.

Regras:
- Converta abreviações e nomes de produtos para o nome comum do ingrediente em português minúsculo (ex: "ACU CRISTAL 5KG" → "açúcar cristal", "FGO INTEIRO" → "frango")
- Inclua somente alimentos e bebidas. Ignore: produtos de limpeza, embalagens, descartáveis, higiene pessoal, eletrônicos, utensílios, etc.
- Se a quantidade/peso estiver visível na linha do produto, inclua-a de forma legível (ex: "1 kg", "500 g", "2 un")

Retorne SOMENTE um array JSON válido, sem texto adicional, sem markdown:
[{"nome":"tomate","quantidade":"1 kg"},{"nome":"frango","quantidade":"2 un"}]

Se não houver ingredientes alimentícios visíveis, retorne exatamente: []`;

export const pantryRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/pantry",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["pantry"],
        response: {
          200: Type.Object({
            items: Type.Array(
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
      const userId = getUserId(request)!;
      return { items: await getPantryItems(userId) };
    },
  );

  app.post(
    "/pantry/items",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["pantry"],
        body: Type.Object({ ingredientId: Type.String({ minLength: 1 }) }),
        response: { 200: Type.Object({ ok: Type.Boolean() }) },
      },
    },
    async (request) => {
      await addToPantry(getUserId(request)!, request.body.ingredientId);
      return { ok: true };
    },
  );

  app.delete(
    "/pantry/items/:ingredientId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["pantry"],
        params: Type.Object({ ingredientId: Type.String() }),
        response: { 200: Type.Object({ ok: Type.Boolean() }) },
      },
    },
    async (request) => {
      await removeFromPantry(getUserId(request)!, request.params.ingredientId);
      return { ok: true };
    },
  );

  app.post(
    "/pantry/receipt",
    {
      preHandler: requireAuth,
      bodyLimit: 8 * 1024 * 1024, // 8 MB — fotos de câmera comprimidas
      schema: {
        tags: ["pantry"],
        body: Type.Object({
          imageBase64: Type.String({ minLength: 1 }),
          mimeType: Type.String(),
        }),
      },
    },
    async (request) => {
      const { imageBase64, mimeType } = request.body;

      // Claude vision — extrai ingredientes do texto da NF
      const message = await anthropic.messages.create({
        model: EXTRACTION_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                  data: imageBase64,
                },
              },
              { type: "text", text: RECEIPT_PROMPT },
            ],
          },
        ],
      });

      // Extrai o JSON da resposta
      const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "[]";
      let extracted: { nome: string; quantidade?: string }[] = [];
      try {
        const match = raw.match(/\[[\s\S]*\]/);
        extracted = match ? (JSON.parse(match[0]) as typeof extracted) : [];
      } catch {
        extracted = [];
      }

      if (extracted.length === 0) return { items: [] };

      // Canonicaliza cada nome contra o catálogo (match por synonyms)
      const names = extracted.map((e) => e.nome.trim().toLowerCase());
      const canonicals = await IngredientModel.findMany(
        { pending: false, synonyms: { $in: names } } as never,
        { projection: { _id: 1, displayName: 1, synonyms: 1 } } as never,
      );

      const nameToCanonical = new Map<string, { id: string; displayName: string }>();
      for (const c of canonicals as { _id: string; displayName: string; synonyms: string[] }[]) {
        for (const syn of c.synonyms) {
          if (names.includes(syn)) nameToCanonical.set(syn, { id: c._id, displayName: c.displayName });
        }
      }

      const items = extracted.map((e) => {
        const key = e.nome.trim().toLowerCase();
        const canonical = nameToCanonical.get(key);
        return {
          rawName: e.nome,
          quantity: e.quantidade ?? null,
          ingredientId: canonical?.id ?? null,
          displayName: canonical?.displayName ?? e.nome,
          matched: !!canonical,
        };
      });

      return { items };
    },
  );
};
