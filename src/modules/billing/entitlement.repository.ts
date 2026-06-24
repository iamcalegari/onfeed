import {
  EntitlementModel,
  type Entitlement,
  type Plan,
} from "./entitlement.model.js";

/**
 * Cache em memória: o gate de IA consulta o plano a cada request, e não vale um
 * findOne no Mongo toda vez. TTL curto — em multi-instância, no pior caso um
 * upgrade leva até TTL para refletir em outra instância; setPlan invalida a local
 * na hora.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { view: EntitlementView; at: number }>();

export interface EntitlementView {
  plan: Plan;
  isPro: boolean;
  currentPeriodEnd: Date | null;
}

const FREE: EntitlementView = { plan: "free", isPro: false, currentPeriodEnd: null };

/** Um entitlement só dá acesso PRO se for plano pro, ativo e não-expirado. */
function viewOf(doc: Entitlement | null): EntitlementView {
  if (!doc || doc.plan !== "pro" || doc.status !== "active") return FREE;
  if (doc.currentPeriodEnd && doc.currentPeriodEnd.getTime() < Date.now()) return FREE;
  return { plan: "pro", isPro: true, currentPeriodEnd: doc.currentPeriodEnd ?? null };
}

export async function getEntitlement(userId: string): Promise<EntitlementView> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.view;

  const doc = (await EntitlementModel.find({ userId })) as Entitlement | null;
  const view = viewOf(doc);
  cache.set(userId, { view, at: Date.now() });
  return view;
}

/** Atalho booleano para o gate de quota. */
export async function isProUser(userId: string): Promise<boolean> {
  return (await getEntitlement(userId)).isPro;
}

/**
 * Concede/altera o plano de um usuário. Hoje chamado pelo endpoint de admin;
 * amanhã, pelo webhook do Stripe (mesma assinatura, source: "stripe").
 */
export async function setPlan(
  userId: string,
  plan: Plan,
  opts: { source?: string; currentPeriodEnd?: Date | null } = {},
): Promise<void> {
  await EntitlementModel.update(
    { userId },
    {
      $set: {
        plan,
        status: "active",
        source: opts.source ?? "admin",
        ...(opts.currentPeriodEnd != null && { currentPeriodEnd: opts.currentPeriodEnd }),
        updatedAt: new Date(),
      },
      $setOnInsert: { insertedAt: new Date() },
    },
    { upsert: true },
  );
  cache.delete(userId); // reflete na própria instância imediatamente
}
