---
status: testing
phase: 03-capture-mandatory-review-ui
source: [03-VERIFICATION.md]
started: 2026-07-02T03:05:00Z
updated: 2026-07-02T11:10:00Z
---

## Current Test

number: 3
name: No-persist-until-confirm (edit, navigate away without confirming, reopen via /import/mine)
expected: |
  The edit is gone; the item still shows 'Em revisão' (reviewRequired still true,
  confirmedAt absent) — nothing was written to the DB by the edit alone.
awaiting: user response

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
result: [pending]

### 4. Progress screen worker-down timeout UX
expected: Stop the import worker, submit an import, watch the progress screen sit at 'Na fila'; after POLL_TIMEOUT_MS (10 min) it shows 'Isso está demorando mais que o esperado' with 'Continuar esperando' / 'Tentar outra URL' — never an indefinite silent spinner.
result: [pending]

### 5. Failure path with a real blocked/unsupported URL
expected: Progress screen reaches 'failed' and shows the mapped ImportFailureReason copy with a 'Tentar outra URL' action.
result: [pending]

### 6. End-to-end live-DB confirm (depends on the pending `npm run setup:db` gate)
expected: After running `npm run setup:db` (syncs Recipe.confirmedAt to the live Atlas validator), a real POST /import → ready_for_review → PATCH confirm write does NOT raise DocumentValidationFailure, and the createdBy fix (03-05) makes the confirmed recipe show up in 'Minhas importações' as 'Confirmada'.
result: [pending]

## Summary

total: 6
passed: 2
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- truth: "GET /import/mine lista as importações do usuário (D-09) — necessário p/ Testes 3 e 6"
  status: fixed
  reason: "listMyImportedRecipes reusava hybridSearch({ queryVector: [] }) → Atlas 500 'vector field is indexed with 1024 dimensions but queried with 0'. Corrigido: novo listImportedRecipesByOwner (findMany puro, sem \$vectorSearch). Achado no UAT ao vivo; testes mockados não exerciam o \$vectorSearch real."
  severity: blocker
  fixed_by_commit: "fix: /import/mine usa filtro puro (listImportedRecipesByOwner)"
  test: 3
