# Changelog

All notable changes to this project are documented here.
This project aims to follow Keep a Changelog and Semantic Versioning.

## Unreleased

- Added: Offline heuristics engine (`src/lib/cbmHeuristics.ts`) plus seed dictionaries for abbreviations/proper nouns.
- Added: `/api/verifier` endpoint and `runLlamaVerifier()` workflow that batches heuristics + LanguageTool findings and routes them through the local Ollama model.
- Added: Apache + Cloudflare tunnel deployment notes and HTML redirect for the district’s `autocbm.com` front door.
- Breaking: Removed terminal groups and group cycling UI. Carets now flag missing punctuation directly at boundaries and are individually clickable.
- UX: Clicking a word cycles its state and synchronizes both adjacent carets to the same state; clicking a caret cycles only that caret.
- Added: Left-side Discard area to drag-remove tokens from the stream and KPIs; Undo button and Cmd/Ctrl+Z support.
- Changed: KPIs compute CWS using word states plus caret flags instead of terminal groups.
- Changed: Output pane now shows the fixer service's corrected text (`fixed`) when available; otherwise it reconstructs by applying normalized edits. This pane no longer reflects discarded tokens.

- UI: Responsive main container widened (`max-w-screen-xl`, `2xl:max-w-screen-2xl`) to better utilize large displays.
- UI: Precise, computed left padding for Discard area using CSS variables (`--discard-x`, `--discard-w`) and `.with-discard-pad` at `xl+` to prevent overlap and keep symmetric spacing.
- Docs: Documented responsive layout and discard-aware padding in README; added tuning notes for CSS variables.

- UX: Allow dragging individual carets to the Discard panel; removed carets are hidden and treated as non-blocking for CWS; Undo restores discarded carets.

- Added: Aggregated “Infractions & Suggestions” list. Identical LanguageTool infractions are grouped by tag + replacement and shown with counts (e.g., `10× PUNC → .`), sorted by most frequent.
- Changed: Updated default sample text in the “Paste student writing” box to the provided passage.
- Fixed: Netlify type error by adding optional `err_type` to `GBEdit` to align with `GbEdit`.
- Docs: Updated README and codemap to describe the new Infractions aggregation behavior.

- Added: Terminal groups now built from VT insertions derived from both INSERT PUNC and MODIFY replacements that contain sentence terminators (e.g., ". We").
- Added: End-of-text terminal support; final boundary groups render and are clickable.
- Changed: Capitalization at sentence start and clear word substitutions (e.g., go→went) are marked incorrect (red) instead of advisory.
- Chore: Debug log of VT boundaries behind `?debug=1`.
- Build: Set `outputFileTracingRoot` in `next.config.js` to avoid workspace root mis-detection in multi-lockfile environments.
- UI: Added rule tooltips on tokens (labels + replacements) and terminal tooltips on carets/dots; CSS pop‑in animation with slight hover delay for a polished feel.
- UI: Removed Spelling tab/page and tabs UI; app now focuses on Written Expression. Simplified control strip to only Time and color key. Updated main header text.
 - Fix: VT now recognizes PUNC INSERT replacements that include spaces (e.g., ". ") by extracting the first sentence terminator, ensuring terminal groups render for those cases.

### Added
- Kiosk Mode: Clean, student-facing timed writing interface at `/kiosk`.
  - Two-step flow: Setup (name + minutes + options) → Writing (text only) → Done.
  - Auto-start timer on first character typed; no word/char counters; no stop-early.
  - Optional timer overlay; paste is always blocked; browser spellcheck/autocorrect disabled.
  - Optional prompt: select from saved prompts or enter custom and save to DB.
  - Shows a green “Submitted” badge after successful DB save.
- Submissions API: Save and fetch writing samples.
  - `POST /api/submissions`, `GET /api/submissions`, `GET /api/submissions/:id`.
  - Table `submissions` includes prompt_id and prompt_text.
- Prompts API: Create and list prompts.
  - `POST /api/prompts`, `GET /api/prompts`, `GET /api/prompts/:id`.
  - Table `prompts` stores id, title, content, created_at.
- Scoring page: Dropdown to load recent submissions by name/date; duration is taken from DB and used for CWS/min.

### Infrastructure
- DB URL detection prefers `NETLIFY_DATABASE_URL`, then `NEON_DATABASE_URL`, `DATABASE_URL`, and `NETLIFY_DATABASE_URL_UNPOOLED`.
- API routes run on Node runtime and are dynamic to ensure env vars are available at request time.

### Added
- Kiosk Mode: Clean, student-facing timed writing interface at `/kiosk`.
  - Two-step flow: Setup (name + minutes) → Writing (text only).
  - Auto-start timer on first character typed; no word/char counters; no stop-early.
  - End-of-time completion screen with Copy and Download actions.
  - Top navigation hides during the writing step to reduce distractions.

### Changed
- Navigation bar added across pages; includes Scoring and Kiosk.

### OCR & Imports
- Added: “Load Scan (PDF/PNG/JPG)” button on the scoring page to import scanned student work.
- Added: Self-hosted Tesseract OCR backend at `POST /api/ocr` (no Google Cloud dependency).
  - Accepts `{ imageBase64?, imageUri?, lang? }` JSON; returns `{ text, raw, words, confidence }`.
- Added: Server-side preprocessing with Sharp for OCR (autorotate, grayscale, normalize, median denoise, slight sharpen, threshold, trim/pad; light upsample for tiny scans).
- Added: PDF support — PDFs render client-side page-by-page to images, each page OCR’d then concatenated.
- Infra: Serve PDF.js worker and modules from same origin to avoid module/CORS issues (`/pdfjs/*`).
- Docs: README updated with Tesseract setup and OCR usage.
# Changelog

## Unreleased

- Add hover previews of scanned words in the scoring UI. When an image/PDF is uploaded and OCR’d, hovering a word token shows a cropped image of the corresponding handwritten/printed word from the scan. This helps compare the OCR output to the original glyphs.
- OCR API now returns the preprocessed image used for Vision as base64 so bounding boxes align client‑side.

## Previous
