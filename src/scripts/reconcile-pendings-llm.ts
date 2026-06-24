/**
 * Reconciliação ASSISTIDA POR LLM dos ingredientes `pending`.
 *
 * O reconcile determinístico (reconcile-ingredients.ts) só resolve variações de
 * preparo com segurança. O grosso dos pendings exige julgamento: são ingredientes
 * legítimos sem canônico (→ promover), variações de um canônico (→ fundir), ou
 * compostos/lixo (→ manter). Isso é trabalho de curadoria — aqui um LLM decide,
 * com a lista canônica inteira (~100 itens) como contexto.
 *
 * Decisões por item:
 *   - merge   → é a MESMA COMPRA que um canônico existente (target = id canônico)
 *   - promote → ingrediente legítimo e distinto, sem equivalente → vira canônico
 *   - keep    → composto ("sal e pimenta"), lixo, ou incerto → fica pending
 *
 *   npm run reconcile:llm            (aplica)
 *   npm run reconcile:llm -- --dry   (só mostra o plano)
 *
 * Idempotente: roda só sobre quem ainda está pending.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  connectDatabase,
  database,
  disconnectDatabase,
} from "@/infra/database/connection.js";
import "@/modules/index.js";
import {
  anthropic,
  effortOption,
  EXTRACTION_MODEL,
} from "@/infra/llm/anthropic.client.js";
import { IngredientModel } from "@/modules/ingredients/ingredient.model.js";
import type { CanonicalIngredient } from "@/modules/ingredients/ingredient.types.js";

const BATCH = 40;

const SYSTEM = `Você cura o catálogo de ingredientes de um app de receitas brasileiro. Cada item "pending" precisa de UMA decisão:

- "merge": é a MESMA COMPRA que um ingrediente do CATÁLOGO CANÔNICO (variação, sinônimo, tradução, marca, forma de preparo, ou parte que se extrai do próprio ingrediente). Informe o id canônico em "target". Funda só quando você compraria EXATAMENTE o mesmo produto no mercado. Ex: "alho picado"→alho, "mussarela ralada"→queijo_mussarela, "raspas de laranja"→laranja, "casca de limão"→limao (a raspa/casca se faz da própria fruta). NUNCA funda produtos diferentes, vendidos à parte: tomate ≠ tomate seco, leite ≠ leite condensado, frango ≠ caldo de frango, chocolate ≠ chocolate em pó, laranja ≠ suco de laranja, açafrão ≠ açúcar.

- "promote": ingrediente legítimo e DISTINTO, sem equivalente no catálogo. Vira canônico próprio. Ex: "mirin", "molho pesto", "tomate seco", "caldo de frango", "ricota".

- "keep": composto de vários ingredientes ("sal e pimenta", "vegetais variados", "mostarda e mel"), lixo, ou você está em dúvida.

Regras de segurança: na dúvida entre merge e promote, escolha promote (não apaga nada). Na dúvida geral, keep. Use APENAS ids que existem no catálogo para "target".`;

const DecisionSchema = z.object({
  decisions: z.array(
    z.object({
      id: z.string(),
      action: z.enum(["merge", "promote", "keep"]),
      target: z.string().nullish(),
    }),
  ),
});

type Decision = z.infer<typeof DecisionSchema>["decisions"][number];

// Segunda passada: o LLM revisa adversarialmente os merges que ele mesmo propôs.
// Merge é destrutivo (deleta o pending), então vale a checagem extra — pegou
// erros como "açafrão→açúcar" e "pasta de gergelim→óleo de gergelim".
const VERIFY_SYSTEM = `Você revisa fusões de ingredientes de um catálogo de receitas brasileiro. Cada linha: "id | pending → canônico". Liste em "wrong" SOMENTE os ids cuja fusão está claramente ERRADA — pending e canônico são produtos de categorias DIFERENTES, comprados separadamente.

Rejeite (ERRADO fundir): açafrão→açúcar, pasta de gergelim→óleo de gergelim, leite→leite condensado, caldo de frango→frango, funcho→cominho, gordura de carne→carne bovina.

NÃO rejeite (fundir é CORRETO) quando o pending é só um TIPO, CORTE, PARTE, FORMATO, MARCA ou PREPARO do canônico: claras de ovo→ovo, bife cubo→carne bovina, rosbife→carne bovina, radiatore→macarrão, baguete→pão, caju torrado→castanha de caju, mussarela desnatada→mussarela, raspas de limão→limão, filé de peixe→peixe, presunto com osso→presunto.

Na dúvida, NÃO inclua (deixe fundir). Só rejeite o que você tem certeza que é outro produto.`;

const VerifySchema = z.object({ wrong: z.array(z.string()) });

async function classify(
  canonList: string,
  batch: CanonicalIngredient[],
): Promise<Decision[]> {
  const pendList = batch.map((p) => `${p._id} | ${p.displayName}`).join("\n");
  const res = await anthropic.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    output_config: {
      format: zodOutputFormat(DecisionSchema),
      ...effortOption("low"),
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `CATÁLOGO CANÔNICO (id | nome):\n${canonList}\n\nCLASSIFIQUE estes pendings (id | nome):\n${pendList}`,
      },
    ],
  });
  return res.parsed_output?.decisions ?? [];
}

type Merge = { p: CanonicalIngredient; near: CanonicalIngredient };

/** Revisa adversarialmente os merges; devolve os ids de pending a NÃO fundir. */
async function verifyMerges(merges: Merge[]): Promise<Set<string>> {
  const bad = new Set<string>();
  const VB = 60;
  for (let i = 0; i < merges.length; i += VB) {
    const chunk = merges.slice(i, i + VB);
    const lines = chunk
      .map((m) => `${m.p._id} | ${m.p.displayName} → ${m.near.displayName}`)
      .join("\n");
    try {
      const res = await anthropic.messages.parse({
        model: EXTRACTION_MODEL,
        max_tokens: 2000,
        output_config: {
          format: zodOutputFormat(VerifySchema),
          ...effortOption("low"),
        },
        system: VERIFY_SYSTEM,
        messages: [{ role: "user", content: lines }],
      });
      for (const id of res.parsed_output?.wrong ?? []) bad.add(id);
    } catch {
      // verificação falhou → rejeita o chunk inteiro (não fundir é o seguro)
      for (const m of chunk) bad.add(m.p._id);
    }
  }
  return bad;
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry") || process.argv.includes("--dry-run");
  await connectDatabase();

  const recipes = database.getCollection("recipes");
  const ingredientsCol = database.getCollection("ingredients");

  const all = (await IngredientModel.findMany({})) as CanonicalIngredient[];
  const canon = all.filter((i) => !i.pending);
  const pendings = all.filter((i) => i.pending);
  const canonById = new Map(canon.map((c) => [c._id as string, c]));
  const pendById = new Map(pendings.map((p) => [p._id as string, p]));
  const canonList = canon.map((c) => `${c._id} | ${c.displayName}`).join("\n");

  console.log(
    `${canon.length} canônicos, ${pendings.length} pendings${dry ? " (dry-run)" : ""}\n`,
  );

  const decisions: Decision[] = [];
  const batches = Math.ceil(pendings.length / BATCH);
  for (let i = 0; i < pendings.length; i += BATCH) {
    const batch = pendings.slice(i, i + BATCH);
    process.stdout.write(`batch ${i / BATCH + 1}/${batches}… `);
    try {
      const decs = await classify(canonList, batch);
      decisions.push(...decs);
      console.log(`ok (${decs.length})`);
    } catch (e) {
      console.log(`FALHOU: ${(e as Error).message}`);
    }
  }

  // Valida e agrupa.
  const merges: { p: CanonicalIngredient; near: CanonicalIngredient }[] = [];
  const promotes: CanonicalIngredient[] = [];
  let keeps = 0;
  for (const d of decisions) {
    const p = pendById.get(d.id);
    if (!p) continue;
    if (d.action === "merge" && d.target && canonById.has(d.target)) {
      merges.push({ p, near: canonById.get(d.target)! });
    } else if (d.action === "promote") {
      promotes.push(p);
    } else {
      keeps++; // keep, ou merge inválido (target inexistente) → conservador
    }
  }

  // Salvaguarda: revisa os merges (destrutivos) antes de confiar neles.
  process.stdout.write(`\nverificando ${merges.length} merges propostos… `);
  const bad = merges.length ? await verifyMerges(merges) : new Set<string>();
  const safeMerges = merges.filter((m) => !bad.has(m.p._id));
  const rejected = merges.filter((m) => bad.has(m.p._id));
  keeps += rejected.length;
  console.log(`${rejected.length} rejeitados`);

  console.log(
    `\n=== PLANO: ${safeMerges.length} merges · ${promotes.length} promotes · ${keeps} keeps ===\n`,
  );
  console.log("MERGES:");
  for (const m of safeMerges) console.log(`  ${m.p._id} → ${m.near._id}`);
  if (rejected.length) {
    console.log("\nREJEITADOS pela verificação (mantidos pending):");
    for (const m of rejected) console.log(`  ✗ ${m.p._id} → ${m.near._id}`);
  }

  if (dry) {
    console.log(`\n(dry-run — nada aplicado)`);
    await disconnectDatabase();
    return;
  }

  let mc = 0;
  let pc = 0;
  for (const m of safeMerges) {
    await IngredientModel.update(
      { _id: m.near._id },
      {
        $addToSet: { synonyms: { $each: [...m.p.synonyms, m.p.displayName] } },
        $set: { updatedAt: new Date() },
      },
    );
    await recipes?.updateMany(
      { "ingredients.canonicalId": m.p._id },
      {
        $set: {
          "ingredients.$[e].canonicalId": m.near._id,
          "ingredients.$[e].isStaple": m.near.isStaple,
        },
      },
      { arrayFilters: [{ "e.canonicalId": m.p._id }] },
    );
    await ingredientsCol?.deleteOne({ _id: m.p._id } as never);
    mc++;
  }
  for (const p of promotes) {
    await IngredientModel.update(
      { _id: p._id },
      { $set: { pending: false, updatedAt: new Date() } },
    );
    pc++;
  }

  console.log(`\naplicado: ${mc} merges, ${pc} promotes, ${keeps} mantidos pending.`);
  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[reconcile-llm] falhou:", err);
  process.exit(1);
});
