import crypto from "node:crypto";

import { env } from "@/config/env.js";

const MP_API = "https://api.mercadopago.com";

export interface Preapproval {
  id: string;
  init_point: string;
  status: string; // pending | authorized | paused | cancelled
  external_reference?: string;
  next_payment_date?: string;
}

/** Cria uma assinatura (preapproval) e devolve o checkout do MP (init_point). */
export async function createPreapproval(params: {
  userId: string;
  payerEmail?: string;
  reason: string;
  amount: number;
  backUrl: string;
}): Promise<Preapproval> {
  const body = {
    reason: params.reason,
    external_reference: params.userId,
    ...(params.payerEmail ? { payer_email: params.payerEmail } : {}),
    back_url: params.backUrl,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: params.amount,
      currency_id: "BRL",
    },
    status: "pending",
  };
  console.log("[MP] createPreapproval body:", JSON.stringify(body));
  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.mp.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`MP preapproval ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<Preapproval>;
}

/** Consulta o estado atual de uma assinatura. */
export async function getPreapproval(id: string): Promise<Preapproval> {
  const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.mp.accessToken}` },
  });
  if (!res.ok) throw new Error(`MP get preapproval ${res.status}`);
  return res.json() as Promise<Preapproval>;
}

/**
 * Valida o header x-signature do webhook do MP — garante que a notificação veio
 * mesmo do Mercado Pago (e não de alguém forjando para virar PRO de graça).
 *
 * Template assinado: `id:{data.id};request-id:{x-request-id};ts:{ts};`
 * HMAC-SHA256(template, secret) em hex deve bater com o v1 do header.
 */
export function verifyWebhookSignature(opts: {
  signatureHeader: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
}): boolean {
  const { signatureHeader, requestId, dataId } = opts;
  if (!env.mp.webhookSecret || !signatureHeader || !dataId) return false;

  // x-signature: "ts=1700000000000,v1=abcdef..."
  const parts: Record<string, string> = {};
  for (const piece of signatureHeader.split(",")) {
    const [k, v] = piece.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = crypto
    .createHmac("sha256", env.mp.webhookSecret)
    .update(manifest)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false; // tamanhos diferentes
  }
}
