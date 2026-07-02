---
tags: [backend, module, usage, quota, cost-control, race-safety]
updated: 2026-07-02
---

> [!INFO] Fase 4 (Plano 04-01) — Cota diária de import dedicada
> Adiciona `ImportUsageModel`/`import_usage`, `consumeDailyImportQuota` e
> `refundDailyImportQuota`. É a primitiva atômica de cota que o gate de
> `POST /import` (Plano 04-05) e o refund no pipeline de falha (Plano 04-06)
> vão consumir. Ver §Cota de Import abaixo.

# Usage

Módulo de contadores diários por usuário — a base para gating por cota
(COST-01/COST-03). Hoje abriga DUAS famílias de cota, deliberadamente
isoladas uma da outra: **adapt** (adaptação de receita via LLM, já existente)
e **import** (import de vídeo, Fase 4).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `usage.model.ts` | Schema Mongoat: coleção `adapt_usage`, índice único `{userId, day}` |
| `import-usage.model.ts` | Schema Mongoat: coleção `import_usage`, índice único `{userId, day}` (Fase 4) |
| `usage.repository.ts` | `consumeDailyAdaptQuota`/`getDailyAdaptCount` (adapt) + `consumeDailyImportQuota`/`refundDailyImportQuota` (import, Fase 4) |
| `usage.repository.test.ts` | Testes unitários (`AdaptUsageModel`/`ImportUsageModel` mockados) — primeira cobertura deste repositório, Fase 4 |

## Por que DUAS coleções, não uma com discriminador

`adapt_usage` e `import_usage` são coleções Mongo **separadas**, cada uma com
seu próprio `Model` mongoat e seu próprio índice único `{userId, day}`. A
alternativa óbvia — um único documento por `{userId, day}` com um campo
`kind: "adapt" | "import"` — foi descartada de propósito (RESEARCH Open
Question 2 da Fase 4, D-02): um bug na lógica de import nunca pode ler,
corromper ou compartilhar o contador de adapt, e vice-versa. Zero
contaminação cruzada, ao custo de duplicar ~20 linhas de schema.

> [!WARNING] `import-usage.model.ts` NUNCA deve tocar `usage.model.ts`
> São arquivos irmãos, não um arquivo estendido. Se uma mudança futura
> precisar tocar as duas famílias de cota ao mesmo tempo, isso é um sinal de
> que a mudança pertence a uma abstração nova (ex.: um helper genérico de
> "cota diária por chave"), não a um dos dois arquivos existentes.

## Cota de Adapt (pré-existente)

`consumeDailyAdaptQuota(userId, limit)` incrementa (atômico, via upsert) o
contador do dia corrente e retorna `{allowed, count, limit}` — conta
*tentativas*, não sucessos, porque a chamada ao LLM é o que custa, então o
cap acontece ANTES de gerar. `getDailyAdaptCount(userId)` é a leitura pura
(sem incrementar) usada pelo `/me`.

## Cota de Import (Fase 4 — Plano 04-01)

`consumeDailyImportQuota(userId, limit)` é uma cópia 1:1 do idioma de
`consumeDailyAdaptQuota`, mas contra o `ImportUsageModel` dedicado — reserva
a vaga atomicamente **na submissão** (COST-01), antes do job entrar na fila
SQS. `refundDailyImportQuota(userId, day)` é a peça genuinamente nova: um
`$inc: {count: -1}` **sem upsert**, chamado pelo pipeline (Plano 04-06)
quando um job reservado falha antes de terminar — devolve a vaga para não
penalizar o usuário por uma falha de infraestrutura/rede que não foi culpa
dele.

```ts
consumeDailyImportQuota(userId, limit) →
  ImportUsageModel.update(
    { userId, day },
    { $inc: { count: 1 }, $setOnInsert: { insertedAt }, $set: { updatedAt } },
    { upsert: true },
  )
  → { allowed: count <= limit, count, limit }

refundDailyImportQuota(userId, day) →
  ImportUsageModel.update(
    { userId, day },
    { $inc: { count: -1 }, $set: { updatedAt } },
  )   // SEM upsert
```

> [!TIP] O índice único `{userId, day}` É a fronteira de atomicidade (T-04-01)
> `user_day_unique` em `import-usage.model.ts` é o que torna o `$inc` upsert
> race-safe: duas reservas concorrentes do mesmo usuário no mesmo dia nunca
> criam dois documentos — a segunda chamada faz `$inc` no doc que a primeira
> acabou de criar/atualizar. O mongoat resolve isso via `findOneAndUpdate`
> atômico do driver Mongo, não via lock aplicativo. Isso limita o overshoot
> possível a +1 sobre o limite (nunca ilimitado) — o mesmo tradeoff aceito
> pela cota de adapt.

> [!WARNING] `refundDailyImportQuota` recebe `day` explícito — nunca "hoje"
> O refund devolve a vaga do dia em que ela foi **reservada**, não do dia em
> que a falha foi detectada. Um job pode ser reservado às 23:58 e falhar às
> 00:02 do dia seguinte — se o refund usasse `new Date()` cegamente, ele
> decrementaria o contador do dia ERRADO (o novo dia, que nunca teve a
> reserva) e o contador do dia da reserva ficaria permanentemente inflado. O
> caller (Plano 04-06, `failJob`) é responsável por passar o dia da reserva
> original (`job.insertedAt`, não `new Date()`).

> [!TIP] `refundDailyImportQuota` nunca usa upsert de propósito
> O documento `{userId, day}` já existe obrigatoriamente quando o refund é
> chamado — ele só é chamado depois de `consumeDailyImportQuota` ter
> reservado a vaga com sucesso para aquele mesmo par `{userId, day}`. Um
> upsert aqui seria sinal de um bug no caller (refund sem reserva prévia),
> então a função deliberadamente NÃO cria o documento — ela só decrementa um
> que já deveria existir.

## Relacionamentos

- `consumeDailyImportQuota` é consumido pelo gate de `POST /import` ([[Import]],
  Plano 04-05) — a reserva acontece antes de criar o `ImportJob` e enfileirar
  a mensagem SQS.
- `refundDailyImportQuota` é consumido pelo `failJob` do pipeline de import
  (`src/infra/video/pipeline.ts`, [[Import]], Plano 04-06) — único ponto seguro
  de refund, chamado exatamente uma vez por job falho (nunca em retry
  per-attempt, para evitar refund duplicado em redelivery SQS).
- Ambas as famílias de cota (`adapt`/`import`) são lidas/expostas nas rotas de
  billing/perfil (`/me`) fora deste módulo — este módulo só guarda o contador
  atômico, não decide o limite (o limite vem de `env.import`, Plano 04-03).
