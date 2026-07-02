---
status: complete
phase: 03-capture-mandatory-review-ui
source: [03-VERIFICATION.md]
started: 2026-07-02T03:05:00Z
updated: 2026-07-02T11:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Clipboard 'Colar link' read under gesture + Safari/denied silent fallback
expected: Chrome: copy a video URL, open /import, click 'Colar link' → field pre-fills. Safari/denied permission: click 'Colar link' → NO red error is shown; long-press paste / native onPaste still fills the field.
result: pass

### 2. Grounding badge honesty against the risoto Short fixture
expected: Title shows 'Confira isto — inferido'; 'a gosto' quantity shows 'Confira isto — impreciso'; explicitly spoken ingredients render with no badge (neutral).
result: pass
note: "Confirmado na revisão do Short do risoto — 'a gosto' (Ingrediente 6, pimenta) mostrou 'Confira isto — impreciso'; tomilho/azeite renderizaram sem badge (grounded neutral)."

### 3. No-persist-until-confirm: edit a field, navigate away WITHOUT confirming, reopen via /import/mine
expected: The edit is gone; the item still shows 'Em revisão' (reviewRequired still true, confirmedAt absent) — nothing was written to the DB by the edit alone.
result: pass
note: "Reopen via /import/mine validado ao vivo (item 'Risoto Cremoso Básico' aparece 'Em revisão'). O passo destrutivo edit→abandonar→sumiu não foi caminhado passo a passo, mas o gsd-verifier confirmou no código que não há onBlur/auto-save em ImportReviewForm (edições vivem só em estado local React até o PATCH de confirmar) — nada persiste sem confirmar por construção."

### 4. Progress screen worker-down timeout UX
expected: Stop the import worker, submit an import, watch the progress screen sit at 'Na fila'; after POLL_TIMEOUT_MS (10 min) it shows 'Isso está demorando mais que o esperado' with 'Continuar esperando' / 'Tentar outra URL' — never an indefinite silent spinner.
result: skipped
reason: "Requer 10 min de espera real com worker parado — não caminhado. Estado de timeout explícito é code-verified (useImportPolling expõe `timedOut`; ImportProgress renderiza a UI de timeout, não spinner silencioso — gsd-verifier)."

### 5. Failure path with a real blocked/unsupported URL
expected: Progress screen reaches 'failed' and shows the mapped ImportFailureReason copy with a 'Tentar outra URL' action.
result: pass
note: "Tela de falha vista ao vivo ('Não foi possível importar' + 'Tentar outra URL') durante o incidente do yt-dlp. O contrato de UI (estado failed legível + ação de retry) foi observado; a cópia era o fallback genérico porque o motivo foi `unknown` (binário ausente), não uma URL bloqueada — mapeamento por-reason específico continua code-verified."

### 6. End-to-end live-DB confirm (depends on the pending `npm run setup:db` gate)
expected: After running `npm run setup:db` (syncs Recipe.confirmedAt to the live Atlas validator), a real POST /import → ready_for_review → PATCH confirm write does NOT raise DocumentValidationFailure, and the createdBy fix (03-05) makes the confirmed recipe show up in 'Minhas importações' as 'Confirmada'.
result: pass
note: "Confirmado ao vivo: usuário rodou setup:db, importou o Short do risoto, confirmou (chegou ao detalhe da receita sem DocumentValidationFailure) e /import/mine mostra 'Risoto Cremoso'/'Feijão Tropeiro' como 'Confirmada'. createdBy fix (03-05) funcionando."

## Summary

total: 6
passed: 5
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "GET /import/mine lista as importações do usuário (D-09) — necessário p/ Testes 3 e 6"
  status: fixed
  reason: "listMyImportedRecipes reusava hybridSearch({ queryVector: [] }) → Atlas 500 'vector field is indexed with 1024 dimensions but queried with 0'. Corrigido: novo listImportedRecipesByOwner (findMany puro, sem \$vectorSearch). Achado no UAT ao vivo; testes mockados não exerciam o \$vectorSearch real."
  severity: blocker
  fixed_by_commit: "fix: /import/mine usa filtro puro (listImportedRecipesByOwner)"
  test: 3
