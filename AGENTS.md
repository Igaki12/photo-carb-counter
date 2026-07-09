# Photo Carb Counter Development Notes

## Project Overview
- This is a React + Vite single-page research prototype for estimating carbohydrate amount from a food photo with a visible hand reference.
- The app is published from `docs/` for GitHub Pages. Do not edit generated files in `docs/` directly; change source files and run `npm run build`.
- This is a research reference tool only. Do not add insulin-dose recommendations or medical treatment guidance.
- Gemini API keys are entered by the user per session and must stay in React memory only. Do not store keys in `localStorage`, `sessionStorage`, IndexedDB, cookies, or URLs.

## Main Commands
- Install dependencies: `npm install`
- Run dev server: `npm run dev -- --port 5173`
- Convert FoodData Central FNDDS data: `npm run data:foods`
- Generate food-name embeddings: `npm run data:embeddings`
- Test: `npm run test`
- Build for GitHub Pages: `npm run build`

## Data Pipeline
- Primary source data: `FoodDataCentral_FNDDS.json`
- FNDDS conversion script: `scripts/convert_fndds_food_data.py`
- Legacy Japanese workbook source: `日本食品標準成分表-炭水化物編_2023.xlsx`
- Legacy Japanese workbook conversion script: `scripts/convert_food_table.py`
- Converted food data:
  - `src/data/foods.json` for tests/imports
  - `public/data/foods.json` for runtime fetch
  - `docs/data/foods.json` after build
- Embedding generation script: `scripts/generate-food-embeddings.mjs`
- Embedding output:
  - `public/data/food-embeddings.json`
  - `docs/data/food-embeddings.json` after build
- FNDDS conversion produces 5432 foods; 5431 have carbohydrate values.
- Embeddings are generated from food names only, using `gemini-embedding-2`, default 768 dimensions.
- Running `npm run data:foods` resets `public/data/food-embeddings.json` because embeddings are tied to food IDs and must be regenerated after changing the food dataset.
- The embedding script supports resume/partial save. If a 429/5xx failure occurs, rerun `npm run data:embeddings`; existing food IDs are skipped.
- Useful generation command:
  ```bash
  export GEMINI_API_KEY='AIza...'
  npm run data:embeddings
  npm run build
  ```

## App Behavior
- The workflow is: API key entry, photo upload, MediaPipe hand detection, hand size selection, food candidate ranking/manual search, additional questions, Gemini structured weight estimation, carbohydrate result.
- MediaPipe Hands runs in-browser through `@mediapipe/tasks-vision`.
- The hand overlay must align to the displayed image area, not the full image-stage container. Keep `src/lib/imageGeometry.ts` and `HandOverlay` behavior intact when changing image layout.
- Food candidate ranking uses dot product over normalized vectors. Manual text search remains available if embeddings are missing or API calls fail.
- Additional questions are rule-based in `src/lib/questions.ts`. Avoid matching staple-food rules against workbook notes unless intentionally needed.
- Final carbohydrate calculation is in `src/lib/carb.ts`, using component grams times FNDDS `Carbohydrate, by difference` g/100g plus question-based adjustments.

## Gemini API Notes
- Browser runtime uses `https://generativelanguage.googleapis.com/v1beta`.
- `src/lib/gemini.ts` handles:
  - API connection test
  - uploaded image embedding
  - structured JSON weight estimation with `gemini-3.5-flash`
- If changing schemas, keep integer gram fields for edible weights and component weights.
- Do not log or persist API keys.

## UI Notes
- The UI direction is a clinical/research tool: white background, compact panels, teal/indigo accents, restrained warnings.
- `public/assets/app-icon.jpg` is the app icon and favicon source.
- The API key label in the top bar is intentionally top-aligned with the input row on wide screens.
- Cards should stay shallow; avoid nested decorative cards or landing-page hero sections.

## Verification Checklist
- Run `npm run test` after logic changes.
- Run `npm run build` after UI, data, or deployment changes.
- Confirm `docs/.nojekyll` exists after build.
- For embedding data, verify:
  - `embeddings.length === 5432`
  - unique `foodId` count is 5432
  - vector length is 768
  - no missing or extra food IDs
- For frontend QA, check:
  - app loads at `http://127.0.0.1:5173/photo-carb-counter/`
  - no Vite overlay or console errors
  - manual search still works
  - upload preview and hand overlay align on images with letterboxing
  - mobile width has no horizontal overflow

## Important Files
- `src/App.tsx`: main workflow composition and state
- `src/components/HandOverlay.tsx`: SVG hand landmark overlay
- `src/components/QuestionForm.tsx`: additional question UI
- `src/lib/gemini.ts`: Gemini API calls
- `src/lib/hand.ts`: MediaPipe Hands setup/detection
- `src/lib/imageGeometry.ts`: object-fit contain geometry for image/overlay alignment
- `src/lib/questions.ts`: food-specific question rules
- `src/lib/ranking.ts`: embedding and text ranking
- `scripts/convert_fndds_food_data.py`: FNDDS JSON to app JSON conversion
- `scripts/convert_food_table.py`: legacy Japanese workbook to JSON conversion
- `scripts/generate-food-embeddings.mjs`: resumable embedding generation
