# Feature Research

**Domain:** Video/link → structured recipe import (recipe app adjacent to "save from social" tools)
**Researched:** 2026-07-01
**Confidence:** MEDIUM (cross-confirmed web sources; no primary API/legal docs consulted for platform ToS)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = the import feels broken or untrustworthy, and users abandon before ever seeing onFeed's Core Value.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Paste-link import (IG/TikTok/YouTube URL → recipe) | This is the baseline interaction in every prior-art tool (ReciMe, Recipe One, FoodiePrep, Cookpad, Mealie/Tandoor for blogs). Users already know "paste link, get recipe" as the pattern. | MEDIUM | Already an Active requirement. Universal adapter must detect platform from URL shape and route to the right yt-dlp extractor. |
| Structured fields: title, ingredients w/ quantity+unit, ordered steps | Every competitor extracts this minimum set. It's literally the definition of "a recipe" vs. a video. Ingredients WITHOUT quantities is the #1 complaint pattern in review sites for weak importers. | HIGH | This is onFeed's Core Value — reuses the quantity+unit fix and ingredient canonicalization already built for `adaptRecipe`. Non-negotiable quality bar. |
| Visible import states: importing / needs-review / failed | Users expect immediate feedback that something is happening (video download + transcription + LLM extraction is not instant — can take 10-30s+). Silent hangs cause abandonment. Failed imports must be explicit, not silently empty. | LOW-MEDIUM | Async job (SQS/Lambda pattern already exists for ingest) + polling or websocket status in UI. Map naturally to existing ingest-handler pattern. |
| Pre-save review/edit screen | No tool auto-saves without a review step for social video imports — extraction from spoken/casual language is inherently lossier than from written blog text (which Mealie/Tandoor handle near-perfectly via schema.org markup). Users expect to fix a mis-heard quantity or reorder a step before committing. | MEDIUM | Reuse the existing recipe edit UI if one exists (adaptRecipe review flow is the closest analog); flag low-confidence fields distinctly (see Differentiators). |
| Thumbnail/image on the recipe | Every recipe card in onFeed already shows an image; an imported recipe without one looks broken next to catalog recipes. | LOW | Already covered by existing `ImageGenerator` port — extract 1 keyframe minimum as fallback even before the 3-image carousel ships. |
| Source link back to original video/post | Baseline expectation once you're extracting from someone else's content — every competitor either auto-attributes (native reshare features) or links back. Missing this is both a trust signal failure and a rights-exposure risk. | LOW | URL is already known (it's the import input) — just persist and display it. |
| Graceful failure with a next step | When a URL can't be parsed (private video, deleted, unsupported platform, geo-blocked), users need a clear message — not a stuck spinner. Competitor pattern: some fall back to manual paste-text import or a "try again / contact support" path. | LOW-MEDIUM | For MVP, a clear error + retry is enough. Full human-fallback support queue (like ReciMe's premium 24h fix) is a post-MVP differentiator, not table stakes. |

### Differentiators (Competitive Advantage)

Features that set onFeed apart. Not required by "does import work," but they compound onFeed's existing strengths (I/E/T/N, macros, shopping list, variant/likes loop).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Full I/E/T/N citizenship for imported recipes | Competitors (ReciMe, Recipe One, FoodiePrep) treat imported recipes as inert cards — a personal cookbook entry. onFeed makes it immediately searchable/matchable, macro-adaptable, and shopping-list-ready like any catalog recipe. This is the actual "why onFeed and not ReciMe" answer. | MEDIUM (mostly integration, not new capability) | Directly named in PROJECT.md Active requirements ("Cidadania plena da receita importada"). Depends on: canonicalization pipeline already handling imported ingredients correctly. |
| Private → public promotion via +5 likes (share-driven virality) | No competitor researched has a social proof / promotion mechanic — they're personal cookbook tools, not a shared catalog. onFeed already has this pattern for `adaptRecipe` variants; extending it to imports turns every import into a potential top-of-funnel acquisition event (shareable link → new user sees onFeed, not just a copy of the recipe). | MEDIUM (mostly reuse) | Depends on: existing variant/like-promotion system (`parentRecipeId`, `createdBy[]`). Low new-build cost since the mechanism exists — main work is applying it to `source: imported` recipes and building the private-but-shareable-by-link state. |
| Confidence-flagged low-certainty fields (quantities inferred from context) | Competitor pattern found: tools that infer vague cues ("a good amount of flour," "salt to taste") do NOT flag which fields were inferred vs. directly stated — user has to guess what to double check. onFeed can differentiate by visually marking inferred/uncertain fields (e.g. subtle badge on a quantity) so users know exactly where to focus their review, building trust faster and reducing time-to-save. | MEDIUM | Requires the extraction LLM call to emit a confidence/provenance signal per field (schema addition), not just the field value. Natural extension of the existing structured-extraction call. |
| Multi-image carousel from keyframes + in-app regenerate | Most competitors show a single scraped thumbnail (or none, for social video). onFeed's carousel (3 keyframes, user-editable, CheffIA regeneration) gives a more polished, catalog-consistent result and covers the case where all extracted keyframes look bad (motion blur, hands blocking food). | MEDIUM-HIGH | Depends on: keyframe extraction step in the video pipeline (new), existing `ImageGenerator`/Bedrock port for regeneration (reuse). |
| Creator attribution as a discovery/goodwill surface (not just a legal footnote) | Table stakes is "link back." Differentiator is treating attribution as a real profile-like element (@handle, platform icon, "view original") displayed prominently on the recipe detail — signals respect to creators (reduces takedown/rights risk) and could seed future creator-facing features. | LOW | Pure UI/data-modeling work once extraction returns handle+profile link; no new backend capability. |
| OCR of on-screen text (PRO) | Competitors rarely mention OCR for social video import at all (the one Preplo mention is beta-quality, unflagged). Cross-referencing spoken audio + on-screen captions/text overlays measurably increases extraction accuracy for videos that show quantities as on-screen text rather than saying them aloud (very common in cooking Reels/TikToks). Gating this as PRO monetizes the accuracy improvement directly. | HIGH | Depends on: keyframe/frame-sampling pipeline (shared with carousel feature), new OCR call (Claude vision or dedicated OCR), cost-aware because it's a per-frame LLM call. |
| Recipe timestamps linked to source video moments | Found in a couple of the more polished tools (Preplo): steps carry a timestamp so users can jump to that moment in the original video while cooking. Not mentioned in Active requirements, but cheap to add if transcript segments are timestamped by Whisper already (they are, by default) and worth flagging as a low-cost, high-delight addition. | LOW (if transcript already has timestamps) | Not currently in Active scope — flag as a candidate for a later phase, not MVP. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create legal, cost, or scope problems. All of these are already correctly listed in PROJECT.md's Out of Scope — validated against research.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Re-hosting/mirroring the source video | Feels convenient — "why make users leave the app to rewatch?" | Research confirms: attribution ≠ permission. Even crediting the creator doesn't shield from copyright claims if the video/audio itself is copied and rehosted. This is the single highest legal-risk anti-feature in the whole space. | Extract facts (ingredients, steps) into onFeed's own structured format; always deep-link to the original post/video on its home platform. Already the plan — confirmed correct by research. |
| Importing arbitrary blog/website URLs | "Since we're already parsing structured recipes, why not also support blog URLs like Mealie/Tandoor?" | Different problem: blog import is a solved, commoditized space (recipe-scrapers library, schema.org microdata — a parsing problem). onFeed's differentiator is specifically video/audio/caption extraction from short-form social content, a harder and more novel problem. Adding blog import dilutes focus without adding to Core Value. | Stay scoped to IG/TikTok/YouTube video sources per PROJECT.md. If users want blog-recipe import later, it's a cheap bolt-on (recipe-scrapers-style) but a separate feature, not part of this milestone. |
| Chatbot / conversational recipe assistant | Competitors increasingly bundle an "AI chef assistant" (e.g. FoodiePrep's Chef Foodie) to feel more modern/sticky. | Already correctly identified in PROJECT.md: chat is commodity, cost is unpredictable/unbounded per conversation (vs. a bounded per-import cost), and doesn't serve the structured, curated-catalog Core Value. CheffIA is positioned as a structured generator, not chat. | Keep CheffIA as a structured, bounded generation feature (image regen, recipe adapt) — never open-ended chat. |
| Auto-save without a review step ("fully automatic" import) | Feels faster/more magical — "why make users check the recipe, just save it." | Research shows even the best tools (ReciMe, Preplo) explicitly warn users to double-check inferred quantities; auto-saving unreviewed extractions into a structured, macro-adapted, shopping-list-feeding system compounds errors downstream (wrong macros, wrong shopping list quantities) — directly undermines Core Value ("se a extração for imprecisa, nada mais importa"). | Always land on a review/edit screen before the recipe is committed, even if pre-filled and fast to confirm. |
| Native app / OS share sheet at MVP | Competitors like ReciMe advertise native share-sheet import as a headline feature; feels like the "real" experience. | Confirmed via Web Share Target research: it requires an installed PWA (or native app) to register as an OS share target — meaningful engineering + packaging work, and only pays off after there's an installed user base to receive shares. Correctly deferred in PROJECT.md. | Ship link-paste (universal, works today on any device) + browser extension (desktop 1-click) first; add Web Share Target once a PWA-install base exists to justify it. |
| Delivery-ingredient affiliate deeplinks bundled into import flow | Tempting to attach "buy missing ingredients" monetization directly onto every imported recipe. | Already ruled out at the business-model level (iFood API is merchant-side only, no per-order affiliate in BR) — confirmed as a dead end previously, unrelated to import quality itself but worth reiterating so it doesn't creep back in via the import UI. | Shopping list integration (already existing feature) is the correct "what to do about missing ingredients" answer — no delivery affiliate needed. |

## Feature Dependencies

```
Paste-link import (universal adapter)
    └──requires──> Video download engine (yt-dlp, multi-platform)
                       └──requires──> Audio transcription (Whisper)
                       └──requires──> Caption/text scrape (per-platform)
                                          └──feeds──> Structured extraction (Claude, ingredients+steps+title)
                                                          └──requires──> Ingredient canonicalization (existing)
                                                          └──feeds──> Pre-save review/edit screen
                                                                          └──requires──> Confidence-flagged fields (differentiator, optional for MVP)

Structured extraction
    └──feeds──> Full I/E/T/N citizenship (embedding + hybrid search indexing)
    └──feeds──> Macro adaptation (existing adaptRecipe pipeline)
    └──feeds──> Shopping list integration (existing)

Keyframe extraction (video pipeline)
    └──feeds──> Multi-image carousel (3 images, user-editable)
                    └──enhances──> CheffIA image regeneration (existing ImageGenerator port)
    └──feeds──> OCR of on-screen text (PRO differentiator)
                    └──enhances──> Structured extraction accuracy

Private recipe + shareable link
    └──requires──> Existing variant/promotion system (parentRecipeId, createdBy[], like counting)
    └──feeds──> Private → public promotion at +5 likes
                    └──enhances──> Acquisition loop (shared link exposes non-users to onFeed)

Browser extension (desktop 1-click capture)
    └──requires──> Paste-link import backend (same pipeline, different entry point)
    └──conflicts with nothing──> purely additive capture UX

Web Share Target / native share sheet
    └──requires──> Installed PWA or native app (NOT available in MVP scope)
    └──enhances──> Paste-link import (removes copy-paste friction on mobile)

PRO gating (quota + OCR + image-gen + volume)
    └──requires──> Usage/entitlement system (existing consumeDailyAdaptQuota pattern)
    └──gates──> OCR of on-screen text
    └──gates──> CheffIA image regeneration volume
    └──gates──> High-volume import (beyond daily free quota)
```

### Dependency Notes

- **Paste-link import requires the video download engine, transcription, and caption scraping to all succeed before extraction can run** — this is the critical path and the single biggest reliability risk (PROJECT.md already flags yt-dlp/platform stability as a central risk). A phase boundary should separate "get raw transcript+caption reliably across 3 platforms" from "make extraction accurate," since the first is an infra/reliability problem and the second is a prompt/quality problem.
- **Structured extraction requires ingredient canonicalization** — this is already built and has known gotchas (duplicate pendings, token-based reconciliation) documented in prior memory; the import pipeline must reuse it correctly rather than re-solving ingredient matching from scratch.
- **Full I/E/T/N citizenship, macro adaptation, and shopping list integration all depend on structured extraction being correct** — none of these are new capabilities to build, but all of them fail silently or produce garbage if extraction quality is low. This is why extraction accuracy is Core Value, not just one feature among many.
- **Private→public promotion enhances (does not require) the import feature to be valuable** — import works standalone (private recipe, personal use) even before promotion is wired up. This means the promotion/virality loop can be sequenced as a later phase without blocking a usable MVP import.
- **Keyframe extraction is a shared dependency for both the image carousel AND OCR** — if the pipeline extracts frames for one, extracting for the other is nearly free. Worth building this as a single shared step rather than two separate frame-sampling implementations.
- **Web Share Target conflicts with MVP timeline, not with the paste-link approach** — it's a strict enhancement layered on top of the same backend; correctly deferred per PROJECT.md Out of Scope.
- **Browser extension and paste-link import are parallel, non-conflicting capture methods** hitting the same backend pipeline — they can be built somewhat independently once the core import API exists, and either can ship first without blocking the other.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate "video → trustworthy recipe" as onFeed's core new value.

- [ ] Paste-link import for IG + TikTok + YouTube — universal capture entry point, works on any device
- [ ] Download (yt-dlp) + transcribe (Whisper) + caption scrape, async via existing SQS/Lambda pattern
- [ ] Structured extraction: title, ingredients w/ quantity+unit, ordered steps, tips — via Claude, reusing canonicalization
- [ ] Import status UI: importing / needs-review / failed states, with clear failure messaging
- [ ] Pre-save review/edit screen (mandatory step before commit — never auto-save)
- [ ] At least 1 image per recipe (single best keyframe as floor, even before full carousel ships)
- [ ] Source attribution: creator @handle + profile link + source video link, displayed on recipe
- [ ] Recipe born private, shareable by link — even before the +5-likes promotion logic ships, "private but shareable" must exist
- [ ] Free import with daily quota (reuses existing quota/entitlement pattern)
- [ ] Full I/E/T/N indexing + macro adaptation + shopping list — imported recipe behaves as a first-class Recipe from day one

### Add After Validation (v1.x)

Features to add once the core import→trust loop is proven (people actually import, review, and save without abandoning).

- [ ] Browser extension for 1-click desktop capture — trigger: once paste-link volume proves the pipeline is reliable, extension is a UX accelerant, not a validator
- [ ] +5-likes → public variant promotion — trigger: once there's a meaningful volume of private imports to promote from
- [ ] Multi-image carousel (3 keyframes) + CheffIA regeneration — trigger: once single-keyframe quality is validated as "good enough to ship," expand to carousel for polish
- [ ] Confidence-flagged low-certainty fields — trigger: once real extraction failure/edit patterns are observed, to know which fields actually need flagging
- [ ] OCR of on-screen text (PRO) — trigger: once audio+caption-only extraction quality ceiling is measured and OCR's accuracy lift is worth the added cost
- [ ] PRO gating expansion (volume tiers beyond basic quota) — trigger: once free-tier usage patterns reveal the right quota threshold

### Future Consideration (v2+)

Features to defer until product-market fit for import itself is established.

- [ ] Web Share Target / native share sheet — defer: requires installed PWA/app base to pay off; premature before import is proven
- [ ] Recipe steps linked to source video timestamps — defer: delight feature, not core to trust or accuracy; cheap to add later since Whisper timestamps already exist in the transcript
- [ ] Human-fallback review queue for failed imports (like ReciMe's 24h manual fix) — defer: operationally expensive; only justified once import volume and failure rate are known

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Paste-link import (universal adapter) | HIGH | MEDIUM | P1 |
| Structured extraction (title/ingredients/steps/tips) | HIGH | HIGH | P1 |
| Pre-save review/edit screen | HIGH | MEDIUM | P1 |
| Import status UI (importing/needs-review/failed) | HIGH | LOW | P1 |
| Source attribution (creator credit + links) | HIGH | LOW | P1 |
| Single keyframe image | MEDIUM | LOW | P1 |
| Private + shareable-by-link recipe state | HIGH | LOW-MEDIUM | P1 |
| Free quota + PRO gate (basic) | HIGH | LOW | P1 |
| Full I/E/T/N + macro + shopping list citizenship | HIGH | LOW (integration) | P1 |
| Browser extension | MEDIUM | MEDIUM | P2 |
| +5 likes → public variant promotion | HIGH (growth) | LOW-MEDIUM (reuse) | P2 |
| Multi-image carousel + regeneration | MEDIUM | MEDIUM-HIGH | P2 |
| Confidence-flagged fields | MEDIUM | MEDIUM | P2 |
| OCR on-screen text (PRO) | MEDIUM | HIGH | P2 |
| Web Share Target / native share | MEDIUM | HIGH | P3 |
| Video-timestamp-linked steps | LOW-MEDIUM | LOW | P3 |
| Human-fallback failed-import queue | LOW (until volume proves need) | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | ReciMe | Mealie / Tandoor (OSS) | onFeed Import (planned) |
|---------|--------|-------------------------|--------------------------|
| Capture UX | In-app paste/share, browser extension, screenshot OCR | Paste URL only (self-hosted, desktop-oriented) | Paste-link (mobile+desktop) + browser extension (desktop) |
| Sources supported | IG, TikTok, Facebook, Pinterest, YouTube, photos, PDFs, handwritten | Any site with schema.org Recipe markup (500+ via recipe-scrapers) | IG, TikTok, YouTube only (video-focused, not blog/web) |
| Extraction basis | Video analysis (audio+visual), OCR for photos | Structured page markup (no video/audio involved) | Audio (Whisper) + caption (base); OCR of on-screen text (PRO) |
| Review before save | Yes, edit screen; imperfect imports common for casual/spoken content | Rarely needed — structured source data is usually near-perfect | Yes, mandatory review/edit screen (Core Value depends on it) |
| Failure handling | Manual paste-text fallback; premium gets human fix within 24h | Silent failure logged; user files GitHub issue for site support | Clear failure state + retry (MVP); human fallback deferred |
| Post-import integration | Personal cookbook card — largely inert after import | Personal recipe book, meal planner | Full I/E/T/N search, macro adaptation, shopping list — first-class catalog citizen |
| Social/growth loop | None found — personal tool | None — self-hosted personal tool | Private→public promotion via +5 likes (share-driven virality) — unique to onFeed |
| Monetization | Import quota (5/week free) + subscription for unlimited/extras | Free (self-hosted OSS, no monetization) | Free import w/ daily quota; OCR + image-gen + high volume = PRO |
| Attribution | Not prominently surfaced as a feature in research found | N/A (site URL retained implicitly) | Explicit creator @handle + profile + source link, prominent on recipe detail |
| Rehost video | No (all competitors extract/reference only) | N/A | No — explicit anti-feature, extract facts only |

## Sources

- [ReciMe — All Your Recipes, In One Place](https://recime.app/) — MEDIUM confidence
- [ReciMe Help — Import from Instagram](https://recime.app/help/en/articles/11596425-import-from-instagram) — MEDIUM confidence
- [ReciMe Help — Import from TikTok](https://recime.app/help/en/articles/11661452-import-from-tiktok) — MEDIUM confidence
- [ReciMe Help — Import error troubleshooting](https://recime.app/help/en/articles/11631434-i-keep-receiving-an-error-when-importing-a-recipe) — MEDIUM confidence
- [I tried 4 viral recipe apps, and there's a clear winner — Android Police](https://www.androidpolice.com/i-tried-viral-recipe-apps-clear-winner/) — MEDIUM confidence
- [12 Best Recipe Apps in 2026 — Recipe One](https://www.recipeone.app/blog/best-recipe-manager-apps) — MEDIUM confidence
- [FoodiePrep — How to Save Recipes from TikTok](https://www.foodieprep.ai/blog/how-to-save-recipes-from-tiktok) — MEDIUM confidence
- [Mealie — Features](https://docs.mealie.io/documentation/getting-started/features/) — MEDIUM confidence
- [Tandoor vs Mealie vs KitchenOwl — Cooklang blog](https://cooklang.org/blog/42-tandoor-vs-mealie-vs-kitchenowl/) — MEDIUM confidence
- [Mealie scraper_strategies.py source (GitHub)](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/scraper/scraper_strategies.py) — MEDIUM confidence
- [Mealie — Importing/scraping recipe failed discussion](https://github.com/mealie-recipes/mealie/discussions/6986) — MEDIUM confidence
- [Preplo — YouTube Recipe Extractor](https://preplo.app/youtube-recipe-extractor) — MEDIUM confidence
- [Preplo — Get Ingredients from Any Cooking Video](https://preplo.app/cooking-video-to-ingredients) — MEDIUM confidence
- [CookingGuru — TikTok/Instagram Recipe Converter](https://cooking.guru/) — MEDIUM confidence
- [Cookpad — Save Recipes from Any Website, TikTok, or Instagram](https://blog.cookpad.com/us/cookpad-recipe-import-feature-save-recipes-from-anywhere/) — MEDIUM confidence
- [Drizzlelemons — Chrome Extension to Save Recipes](https://www.drizzlelemons.com/blog/chrome-extension-save-recipes-ad-free) — MEDIUM confidence
- [MDN — share_target Web app manifest reference](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target) — MEDIUM confidence
- [Chrome for Developers — Web Share Target API](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target) — MEDIUM confidence
- [web.dev — Integrate PWAs into sharing UIs with Workbox](https://web.dev/articles/workbox-share-targets) — MEDIUM confidence
- [LexDMCA — Is Reposting Without Credit Copyright Infringement?](https://lexdmca.com/blog/reposting-without-credit-is-it-copyright-infringement-on-instagram-tiktok/) — MEDIUM confidence
- [AC Legal — Reposting Social Media Content, Avoid Copyright Lawsuits](https://www.ac-legal.com/infringement-in-the-reposting-copyright-lawsuits-from-reposting-social-media-content/) — MEDIUM confidence
- [Katie Charleston Law — Fair Use vs. Infringement for Influencers](https://www.katiecharlestonlaw.com/blog/2025/march/fair-use-vs-infringement-legal-advice-for-influe/) — MEDIUM confidence
- [DishGen — Infinite AI-Powered Recipe Generator](https://oneingredientchef.com/introducing-dishgen/) — MEDIUM confidence
- [Recipe Grids — AI Recipe Generator](https://recipegrids.com/ai-recipe-generator/) — MEDIUM confidence
- [OrganizEat — Top Apps with Built-In OCR for Recipes](https://home.organizeat.com/blog/top-apps-with-built-in-ocr-for-recipes/) — MEDIUM confidence
- [Stephen Turner — Video to audio to transcript to summary using local AI](https://blog.stephenturner.us/p/video-to-audio-transcript-to-summary-whisperfile-llama) — MEDIUM confidence
- [yt-transcript — yt-dlp + Whisper + LLM summary (GitHub)](https://github.com/kiuckhuang/yt-transcript) — MEDIUM confidence
- [Tapp — Social And UGC Viral Loops For Mobile App Growth](https://www.tapp.so/blog/social-viral-loops-for-apps/) — MEDIUM confidence
- [Flavorish — Save Recipes from Social Media](https://www.flavorish.ai/blog/save-recipes-from-social-media-with-flavorish) — MEDIUM confidence
- `.planning/PROJECT.md` (internal — Requirements, Constraints, Key Decisions sections)
- `.planning/codebase/ARCHITECTURE.md` (internal — existing Recipe model, variant/promotion pattern, image generation strategy, quota pattern)

---
*Feature research for: video/link → structured recipe import (onFeed Import milestone)*
*Researched: 2026-07-01*
