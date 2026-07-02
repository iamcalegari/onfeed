---
status: testing
phase: 03-capture-mandatory-review-ui
source: [03-VERIFICATION.md]
started: 2026-07-02T03:05:00Z
updated: 2026-07-02T03:05:00Z
---

## Current Test

number: 1
name: Clipboard 'Colar link' read under gesture + Safari/denied silent fallback
expected: |
  Chrome: copy a video URL, open /import, click 'Colar link' → field pre-fills.
  Safari/denied permission: click 'Colar link' → NO red error is shown; long-press
  paste / native onPaste still fills the field.
awaiting: user response

## Tests

### 1. Clipboard 'Colar link' read under gesture + Safari/denied silent fallback
expected: Chrome: copy a video URL, open /import, click 'Colar link' → field pre-fills. Safari/denied permission: click 'Colar link' → NO red error is shown; long-press paste / native onPaste still fills the field.
result: [pending]

### 2. Grounding badge honesty against the risoto Short fixture
expected: Title shows 'Confira isto — inferido'; 'a gosto' quantity shows 'Confira isto — impreciso'; explicitly spoken ingredients render with no badge (neutral).
result: [pending]

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
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
