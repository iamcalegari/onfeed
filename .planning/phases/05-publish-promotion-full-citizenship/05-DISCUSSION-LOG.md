# Phase 5: Publish, Promotion & Full Citizenship - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 5-Publish, Promotion & Full Citizenship
**Areas discussed:** Shareable link + who acts, Link format/privacy, Promotion semantics, Catalog/search citizenship, Design (public page), Edge cases (likes lifecycle, canonical URL)

---

## Shareable link & access model (SOC-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Ver público, curtir com login | Public route reads without Clerk; like redirects to sign-in. Preserves promotion integrity (1 account = 1 like), removes view barrier. | ✓ |
| Ver público + like anônimo | Anonymous like via device/anon token. Maximizes counts but opens promotion fraud (bots inflate the +5). | |
| Login para ver e curtir | Reuses `(main)`/Clerk; simplest, but link recipients without accounts hit a login wall — kills the acquisition loop. | |

**User's choice:** Ver público, curtir com login (Recommended)
**Notes:** Anchors the whole growth loop while keeping the like-gated promotion honest.

---

## Link format & privacy (SOC-01/02)

| Option | Description | Selected |
|--------|-------------|----------|
| Token secreto por receita | Random `shareSlug`; public `/r/[token]` resolves by token, never raw objectId. Linkable at confirm; impossible to enumerate. | ✓ |
| objectId + estado 'unlisted' | Owner shares → `visibility:'unlisted'`; `/recipe/[id]` opens for id-holders. Simpler, but Mongo objectIds are guessable (timestamp) — enumerable. | |
| objectId público direto | Every confirmed import public via `/recipe/[id]`, no token/action. Simplest, but leaks by id enumeration; no private/shared distinction. | |

**User's choice:** Token secreto por receita (Recommended)
**Notes:** Every confirmed import is instantly linkable (token exists at `confirmedAt`).

---

## Promotion semantics — effect on the import (SOC-04/05)

| Option | Description | Selected |
|--------|-------------|----------|
| Fica 'imported', vira public | Keep `source:"imported"`, flip `visibility private→public`; widen search for imported+public. Grounding + creator credits keep rendering. | ✓ |
| source 'imported' → 'variant' | Swap source to `variant`, join existing variant flow (max reuse). But loses imported identity (grounding/credit hooks key on `source==="imported"`). | |

**User's choice:** Fica 'imported', vira public (Recommended)
**Notes:** SOC-05 falls out for free — `sourceMeta` + `createdBy[]` survive because source is unchanged.

## Promotion semantics — confidence bar

| Option | Description | Selected |
|--------|-------------|----------|
| Barra de promoção dedicada | New env threshold + require `confirmedAt`. Separates "good enough to review" from "good enough for the public". | ✓ |
| Reusar o limiar de reviewRequired | Reuse the `reviewRequired` confidence threshold. Less new config but conflates two purposes. | |

**User's choice:** Barra de promoção dedicada (Recommended)

---

## Catalog citizenship & search (RCP-01..04)

| Option | Description | Selected |
|--------|-------------|----------|
| Aparece com selo 'importada' | In owner's search/swipe with I/E/T/N + visual 🎬 badge. Full citizenship + transparency. | ✓ |
| Misturada, sem selo | Identical to any catalog recipe. Literal citizenship, but owner can't tell it's their private import. | |
| Só na aba Minhas importações | Private imports out of general search until public. Simpler, but contradicts RCP-04. | |

**User's choice:** Aparece com selo 'importada' (Recommended)

---

## Design — public share page (logged-out visitor)

| Option | Description | Selected |
|--------|-------------|----------|
| Receita completa read-only + CTAs | Full recipe + like + "crie conta/importe a sua"; account actions route to sign-in. Maximizes conversion. | ✓ |
| Prévia limitada (teaser) | Title/image/credits/first ingredients; rest gated. Friction; feels like a paywall on a "free" recipe. | |
| Completa, sem CTAs extras | Everything + like, no signup push. Clean, but wastes the acquisition moment. | |

**User's choice:** Receita completa read-only + CTAs (Recommended)

---

## Edge cases (extra areas explored)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-publicar vs consentimento | (offered) auto-public vs owner-confirm on promotion | not selected |
| Revogação/expiração do token | (offered) revoke/rotate/expire the shareSlug | not selected |
| Ciclo de vida dos likes | Owner self-like counts? Likes survive deletion? | ✓ |
| URL canônica pós-promoção | `/r/[token]` vs `/recipe/[id]` after public | ✓ |

**Resolved (Claude recommendation, user did not contest):**
- **Likes lifecycle:** owner/importer self-like does NOT count toward the +5; deleting/rejecting the import cascades-removes its likes and voids promotion.
- **Canonical URL:** `/r/[token]` stays valid forever but redirects to canonical `/recipe/[id]` once public; token is the only door while private.

## Claude's Discretion
- Env var names, public route naming, badge copy/icon, CTA wording, redirect mechanism.

## Deferred Ideas
- **Capture bug** — "colar link" opens native paste menu instead of reading clipboard (`PasteLinkButton.tsx`); fix with `navigator.clipboard.readText()`. Handled as a separate batch right after this CONTEXT.
- **Capture feature** — PIX-style clipboard recipe-link detection on app open → import prompt + prefill. New capture capability with clipboard-permission/iOS/privacy caveats; candidate for "capture v2".
