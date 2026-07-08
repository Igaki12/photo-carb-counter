# Photo Carb Counter Research App Plan

## Summary
Build a React + Vite single-page research prototype published from `docs/` on GitHub Pages. The app estimates carbohydrate amount from one uploaded food photo with a visible hand reference, using MediaPipe Hands locally, Gemini Embedding 2 for food candidate ranking, Gemini 3.5 Flash structured output for edible-weight estimation, and the Japanese Standard Food Composition Table carbohydrate workbook as the nutrition source.

Default decisions:
- Output carbohydrate estimate only, not insulin dose.
- Gemini API key is entered every session and kept in React memory only.
- Use all 1101 foods from the workbook as candidates.
- Use the approved clinical/research-tool UI direction from `/Users/igaki/.codex/generated_images/019f4109-85d7-7d41-9dae-2e0b23754e25/ig_0ea67733cde03d1e016a4e1830a3c88194b4ede9f8e660c018.png`.

## Key Changes
- Scaffold a React + Vite app configured for GitHub Pages:
  - `vite.config.ts`: `base: "/photo-carb-counter/"`, `build.outDir: "docs"`.
  - Add `docs/.nojekyll` after build.
  - Keep app source outside `docs/`; `docs/` is build output only.
- Add client workflow:
  - API key input and connection test.
  - Image upload and preview.
  - MediaPipe Hand Landmarker detection with overlay.
  - Hand size selector: small / standard / large.
  - Gemini image embedding call for uploaded photo.
  - Dot-product ranking against precomputed food-name embeddings.
  - User-selectable food ranking with manual correction.
  - Food-specific additional questions while LLM weight estimation is running.
  - Final result with carbohydrate range, integer edible-weight estimate, short rationale, and fixed medical caution.
- Add data pipeline:
  - Convert `日本食品標準成分表-炭水化物編_2023.xlsx` into app JSON with food id, group, food number, name, notes, `CHOAVL` g/100g, numeric parse flags, and source metadata.
  - Add `scripts/generate-food-embeddings.mjs` requiring `GEMINI_API_KEY`; output normalized vectors at reduced dimensionality, recommended 768, for static loading.
  - If embeddings are missing, app still builds and shows a clear “embedding data not generated” state.
- Add question rules:
  - Rule-based question bank by food group/name regex.
  - Beverages ask about sugar, syrup, milk, serving size.
  - Bread/sandwich ask bread type/count, spreads, cheese, bacon/meat, sauce/dressing, sweet sides.
  - Rice/noodles/sweets/fruits get category-specific portion and additive questions.
- Use Gemini structured output for weight estimation:
  - Prefer component-level integer grams for composite foods.
  - Schema includes selected food, visible components, estimated edible grams, min/max grams, confidence, and short rationale.
  - Final carb calculation uses `component grams * CHOAVL / 100`, plus user-answer adjustments.

## Interfaces
- `FoodItem`: `id`, `foodNo`, `group`, `name`, `carbAvailableGPer100g`, `carbMonosaccharideEqGPer100g`, `note`, `isEstimated`, `source`.
- `FoodEmbedding`: `foodId`, `vector`, `model`, `dimensionality`, `normalized`.
- `QuestionAnswer`: `questionId`, `label`, `value`, `unit`, `carbAdjustmentG?`.
- `WeightEstimate`: integer component weights, min/max range, confidence, rationale.
- `CarbEstimate`: total grams, min/max grams, selected foods/components, fixed caution text.

## Test Plan
- Unit-test workbook parsing:
  - Parenthesized values parse as numeric with `isEstimated`.
  - `Tr`, `-`, and blank values are handled consistently.
  - Coffee, sugar, milk, bread rows are present.
- Unit-test carb calculation:
  - Single food: grams x g/100g.
  - Composite sandwich: component sum.
  - Sugar/milk answer adjustments.
- Unit-test ranking:
  - Normalized dot product ordering.
  - Manual selected food overrides ranking.
- Browser QA:
  - Desktop and mobile responsive workflow.
  - Missing API key, bad API key, no hand detected, no embeddings, LLM failure.
  - Build succeeds and `docs/` can be served as static GitHub Pages output.

## Assumptions
- This remains a research reference tool and must not recommend insulin dose.
- API keys are not stored in localStorage, sessionStorage, IndexedDB, or URL params.
- MediaPipe model assets are bundled or loaded from an explicit public path, not fetched from unstable “latest” URLs.
- Food embeddings require a separate generation step with a valid Gemini API key.
- The app will show that estimates may be wrong and treatment decisions require medical-professional guidance.
