# Written Expression (TWW, WSC, CWS) – with Flags

A TypeScript React web application for Curriculum‑Based Measurement (CBM) written expression scoring.

## Kiosk — Timed Writing

 A focused, student-facing timed writing interface is available at `/kiosk`.

 - Clean two-step flow: setup, then writing only
   - Step 1 (Setup): Enter optional student name, select duration (minutes), choose options (show timer, optional prompt), then Continue.
   - Step 2 (Writing): Only the text field is shown. The timer starts automatically on the first character typed. No word/character counters, and no stop‑early control to avoid distractions.
 - Session end: When time elapses, the page beeps and switches to a completion view where the text can be copied or downloaded as `.txt`, or a new session can be started.
 - Submission badge: A green “Submitted” indicator appears after a successful database save.
 - Navigation: The top nav is hidden during the writing step to keep the student focused.

 Options on setup
 - Show timer in writing view: Displays a subtle countdown in the top‑right during writing.
 - Include a writing prompt: Select a saved prompt from the dropdown or enter a custom prompt. Custom prompts can be saved for future use.

 Writing view specifics
 - Paste is always blocked (to preserve the integrity of the timed writing sample).
 - Browser spellcheck and auto-correct are disabled.

## Breaking Changes (v9.0)

- Removed terminal groups (^ . ^) and any group toggling UI.
 - Missing punctuation is flagged directly on the caret between words; carets are individually clickable to override boundary status.
- Added left-side Discard area: drag words or individual carets to remove them from the stream and KPIs; Undo via button or Cmd/Ctrl+Z.
- KPIs now compute CWS using word states plus caret flags (no group acceptance needed).
- Output text now shows the fixer service's corrected text (LanguageTool + irregular verb patcher). If the service omits a `fixed` field, the UI reconstructs the draft by applying the normalized edits. Discarded tokens do not affect this pane.
- Grammar analysis now runs entirely on the self-hosted stack: `/api/languagetool/v1/check` talks to the local LanguageTool container, and `/api/verifier` asks the local Llama (Ollama) instance to sanity-check high-risk edits.
- OCR no longer depends on Tesseract. `/api/ocr` preprocesses uploads with Sharp and runs them through the bundled Tesseract worker so everything stays offline.

## Local-first mode

- **LanguageTool**: `${LT_BASE_URL:-http://127.0.0.1:8010}` (`/v2/check` endpoint, consumed by `/api/languagetool/v1/check`).
- **Llama verifier**: `${LLM_BASE_URL:-http://127.0.0.1:11434/v1}` (Ollama-compatible `/chat/completions`, consumed by `/api/verifier`).

Smoke test both services after bringing up the stack:

```bash
curl -s -X POST http://localhost:3000/api/languagetool/v1/check \
  -H 'Content-Type: application/json' \
  -d '{"text":"I has an apple.","language":"en-US"}'

curl -s -X POST http://localhost:3000/api/verifier \
  -H 'Content-Type: application/json' \
  -d '{"text":"I has an apple.","mode":"quick"}'
```

### Local containers (LanguageTool + Ollama)

Launch the local services from the project root:

```bash
docker compose -f docker-compose.local.yml up -d
```

Set the endpoints for the Next.js app (e.g., in your shell or `.env.local`):

```bash
export LT_BASE_URL="http://127.0.0.1:8010"
export LLM_BASE_URL="http://127.0.0.1:11434/v1"
```

After the containers are healthy, load the Llama model once to ensure it is downloaded:

```bash
ollama run llama3.1:8b-instruct
```

> Tip: use `npm run smoke:lt` and `npm run smoke:llm` to confirm both services return HTTP 200.

### Cold start helper

For a clean reboot you can run the bundled helper:

```bash
scripts/cold-start.sh
```

This script performs the following:

1. Verifies your Node.js version matches the project requirement.
2. Runs `npm install` (skip with `SKIP_INSTALL=1`).
3. Starts the local Docker services defined in `docker-compose.local.yml` (LanguageTool, fixer, Ollama).
4. Builds the standalone Next.js output (`npm run build`).
5. Syncs `.next/static` and `public/` into `.next/standalone/` so the standalone server can serve assets.
6. Optionally runs the smoke tests (`RUN_SMOKE_TESTS=0` to skip).
7. Uses `nvm` (if available) to switch to Node.js 20, then restarts Colima and sets Docker to talk to its socket (via `colima env` or `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`) so the daemon is ready (`RESTART_COLIMA=0` to skip).
8. Stops a host-side Ollama service if detected and frees port 11434 (`STOP_HOST_OLLAMA=0` or `FORCE_FREE_PORTS=0` to skip).
9. Starts a Cloudflare tunnel if `cloudflared` is installed (disable with `START_CF_TUNNEL=0`, customize command via `CF_TUNNEL_CMD` or `CF_TUNNEL_NAME`).
10. Launches the standalone server (`npm start`).

You can pass environment flags such as `SKIP_INSTALL=1`, `RUN_SMOKE_TESTS=0`, `RESTART_COLIMA=0`, `STOP_HOST_OLLAMA=0`, or `FORCE_FREE_PORTS=0 ./scripts/cold-start.sh` to tailor the run.
Cloudflare tunnel output is written to `cloudflared.log` by default; override with `CF_TUNNEL_LOG=/path/to/log`.

### Standalone build layout

When running `npm run build` and starting the standalone server (`npm start`), ensure the following directories sit alongside `.next/standalone/server.js`:

- `.next/standalone/`
- `.next/static/`
- `public/`

Most deployment targets accomplish this by copying `.next/static` and `public` next to the extracted `.next/standalone` directory before launching the server binary.

## Features

### Written Expression Scoring
- **TWW (Total Words Written)**: Counts all words written, including misspellings, excluding numerals
- **WSC (Words Spelled Correctly)**: Uses the dockerized LanguageTool service plus the fixer microservice for irregular verb support; results feed the same highlighting pipeline as before.
- **CWS (Correct Writing Sequences)**: Mechanical, CBM-aligned scoring of adjacent unit pairs with visual caret indicators
- **Heuristic rubric checks**: Offline rules catch missing sentence terminals, lowercase sentence starts, fused sentences, unmatched wrappers, and rubric-driven number handling before they impact KPIs.
- **LLM sanity check**: Each batch of LanguageTool edits is reviewed by a local Llama model (Ollama) and any "do not apply" recommendations show up in the sidebar.

### OCR Input (Self-Hosted Tesseract)
- **Load Scan button**: On the scoring page, click “Load Scan (PDF/PNG/JPG)” to import scanned work.
- **PDF support**: Multi‑page PDFs render client‑side and are OCR’d page‑by‑page.
- **Preprocessing**: Server trims and enhances images (autorotate, grayscale, normalize, denoise, slight sharpen, threshold, crop/pad) before sending them to Tesseract.
- **Backend**: `/api/ocr` now runs Tesseract.js locally (no Google Cloud dependencies) and returns token-level bounding boxes and confidences for hover previews.
- **Hover preview of scanned words**: After uploading a scan, hover over any word token in the UI to see an image snippet of the corresponding handwritten/printed word from the scan. This helps teachers visually compare the scanned glyphs to the OCR/typed output. Previews are generated from the same preprocessed image passed into Tesseract so offsets line up.

<!-- Spelling assessment (CLS) removed; app now focuses on Written Expression only -->

### Navigation & Pages
- Top navigation includes:
  - `Scoring` — Main written expression scoring tool (home page)
  - `Kiosk` — Student-facing timed writing interface
  - Scoring page has a “Load submission” dropdown of recent student names and dates from the database; choosing one loads the text and uses the stored duration for CWS/min. A banner shows the loaded id, student, date, and duration.

### Data Persistence (Neon on Netlify)
- Environment: Set one of these in Netlify env vars:
  - `NETLIFY_DATABASE_URL` (preferred on Netlify)
  - or `NEON_DATABASE_URL`
  - or `DATABASE_URL`
  - Optionally `NETLIFY_DATABASE_URL_UNPOOLED` is also recognized
- API endpoints:
  - `POST /api/submissions` — Save a submission. Body: `{ student?: string, text: string, durationSeconds?: number, startedAt?: string, promptId?: string|null, promptText?: string|null }`. Returns `{ id }`.
  - `GET /api/submissions` — List recent submissions.
  - `GET /api/submissions/:id` — Get a specific submission including full `content`.
  - `GET /api/prompts` — List saved prompts (id, title, content, created_at).
  - `POST /api/prompts` — Create a new prompt. Body: `{ title: string, content: string }`. Returns `{ id }`.
  - `GET /api/prompts/:id` — Get a specific prompt.
- Schema: Created on first use:
  - `submissions (id text primary key, student_name text, content text not null, duration_seconds int, started_at timestamptz, submitted_at timestamptz default now(), prompt_id text, prompt_text text)`
  - `prompts (id text primary key, title text not null, content text not null, created_at timestamptz default now())`
- `generator_samples (id text primary key, source text, original_text text not null, fixed_text text, grammar_edits jsonb, llama_verdict jsonb, tww int, wsc int, cws int, eligible int, minutes numeric, created_at timestamptz default now())`
- Generator API endpoints:
  - `POST /api/generator/samples` — Persist a LanguageTool run (with optional Llama verdict and KPI snapshot).
  - `GET /api/generator/samples?limit=25` — Fetch recent stored samples.
- Kiosk auto‑saves when time expires and shows an “Open in Scoring” shortcut.

Local development
- Use one of:
  - `netlify dev` (uses NETLIFY_* env vars automatically), or
  - Add `DATABASE_URL` to `.env.local` with your Postgres connection string.
- The API routes are configured to run on the Node.js runtime and dynamically (no static bundling), so server env vars are used at request time.


### Advanced Features
- **Centralized Status Classes**: Static string literals for Tailwind CSS classes with safelist protection
- **Immutable State Management**: No mutations - all state updates use immutable patterns with derived KPIs
- (Deprecated) Terminal groups (^ . ^) were removed; caret flags now indicate missing punctuation directly at boundaries
- **Visual Synchronization**: All members of terminal groups share colors, selection state, and visual feedback
- **Paragraph-Aware Terminal Insertion**: Respects paragraph boundaries and inserts sentence terminals even at end-of-text when missing; handles GB MODIFY-based sentence splits (e.g., ". We") in addition to PUNC INSERTs
- **Reactive KPI Updates**: KPIs automatically recalculate when tokens or groups are clicked
- **Deduplication Logic**: New `buildTerminalGroups` function eliminates duplicate "^ . ^ . ^" triples at paragraph breaks
- **Immediate KPI Computation**: Click handlers trigger instant KPI recalculation with console logging for debugging
- **Tailwind Color Safelist**: Comprehensive safelist ensures all dynamic color classes render properly
- **LanguageTool API**: Professional spell checking and grammar analysis via LanguageTool's neural API
- **LanguageTool Integration**: Professional spell checking and grammar checking via LanguageTool API
- **Spell Engine Status**: Visual indicator showing LanguageTool spell checking mode
- **Spelling Suggestions**: Tooltip suggestions for misspelled words via LanguageTool
- **LanguageTool Grammar**: Automatic grammar checking with debounced text analysis
- **Request Cancellation**: AbortSignal support for grammar checking requests
- **Rate Limiting**: Simple backoff handling for LanguageTool 429 responses
- **Infraction Flagging**: Automated detection of definite vs. possible issues from LanguageTool
- **Aggregated Infractions List**: Groups identical LanguageTool infractions by type + replacement and shows a frequency count (e.g., `10× PUNC → .`), sorted by most frequent
- **Output Text (Corrected)**: Blue box shows LanguageTool's full corrected text; falls back to locally applying GB edits if needed
- **Rule Tooltips**: Instant, accessible tooltips show rule labels and suggested replacements on hover for tokens; terminal dots/carets show proposed punctuation. Includes a subtle pop‑in animation.
- **Interactive Overrides**: Click words to toggle WSC scoring; clicking a word also synchronizes the two adjacent carets to match the word's new state. Click carets to cycle their state individually.
- **CWS Engine**: Strictly mechanical, CBM-aligned engine with visual caret indicators and boundary validation
- **Rule-based Checks**: Capitalization, terminal punctuation, and sentence structure validation
- **Spell Result Caching**: Intelligent caching for LanguageTool API responses
- **Curly Apostrophe Support**: Proper handling of smart quotes and apostrophes
- **Token Character Offsets**: Precise character position tracking for LanguageTool issue alignment
- **Discard Controls**: Drag words or individual carets into the Discard panel to hide them from the stream and make them non‑blocking for CWS; Undo restores the last removal (Cmd/Ctrl+Z).

### Layout & Responsiveness
- **Wide Container on Large Screens**: Main wrapper uses `max-w-screen-xl 2xl:max-w-screen-2xl` so the app fills more of a 1080p/1440p display while staying fluid on smaller screens.
- **Discard-Aware Padding (Calculated)**: At `xl` and up, the body reserves exactly the space needed for the left Discard area using CSS variables and a utility class:
  - Variables in `src/app/globals.css`:
    - `--discard-x`: distance from window edge to discard area (gap)
    - `--discard-w`: width of the discard area
  - Padding applied via `.with-discard-pad` only at `xl+`: `padding-left = (2 × gap) + width`, creating equal spacing on both sides of the discard and preventing overlap.
- **Tuning**: Adjust `--discard-x` and `--discard-w` in `globals.css` to change the discard size/offset, or override them inside media queries for per‑breakpoint sizing.
- **CWS-LanguageTool Integration**: Grammar suggestions mapped to CWS boundaries with advisory hints
- **3-State Caret Cycling**: Yellow (advisory) → Red (incorrect) → Green (correct) → Yellow (default)
- **Advisory Infractions**: LanguageTool grammar suggestions shown as yellow advisory entries
- **Color Legend**: Visual guide for teachers explaining caret color meanings
- **Derived Metrics**: CIWS, %CWS, and CWS/min calculations with time control
- **Time Control**: Configurable probe duration (mm:ss format) for fluency rate calculations
- **IWS Categorization**: Detailed categorization of Incorrect Writing Sequences by reason
- **Virtual Terminal Insertion**: Smart detection and insertion of missing sentence-ending punctuation with interactive teacher controls
- **One-Click Group Cycling**: Click virtual terminal dots to cycle both adjacent carets in lock-step (yellow→red→green→yellow)
- **Enhanced Virtual Terminal System**: Comprehensive boundary tracking with proper CWS integration when accepted
- **Grammar Mode Badge**: Always-visible indicator showing current grammar checking configuration
- **Export Functionality**: CSV audit export and PDF report generation
- **Privacy Controls**: FERPA/COPPA aligned—grammar/OCR stay on the self-hosted stack (no third-party APIs)
- **Rate Limiting**: Automatic backoff for LanguageTool API rate limits
- **Golden Tests**: Comprehensive test suite for CWS rule validation
- **License Compliance**: LanguageTool API usage compliance
- **GB Token Annotation**: Visual token highlighting with color-coded pills (green=correct, yellow=possible, red=incorrect)
- **Caret Row Display**: Visual caret indicators showing GB-proposed terminal punctuation positions
- **Capitalization Overlays**: Optional display of capitalization fixes without changing source text
- **Terminal Dots**: Visual indicators for punctuation insertions from GB analysis
- **Enhanced Infractions**: LT + Llama infractions panel with proper GRMR/SPELL/PUNC tagging

## Recent Improvements

### Terminal Group System Overhaul (v8.1)
- **Single Clickable Units**: Terminal groups (^ . ^) are now single buttons that toggle the entire group together
<!-- Legacy: terminal groups/dots were non-interactive. Current UI uses individually clickable caret buttons. -->
- **Unified State Management**: Single click handler cycles entire terminal groups while maintaining individual token control
- **Deduplication Logic**: New `buildTerminalGroups` function eliminates duplicate "^ . ^ . ^" triples at paragraph breaks
- **Boundary-Based Grouping**: Groups are deduplicated by boundary index to prevent overlapping suggestions
- **Source Tracking**: Terminal groups track their source ('LT' for LanguageTool, 'PARA' for paragraph fallback)
- **Clean Word Coloring**: Words before terminal groups are no longer colored by PUNC edits
- **Enhanced UX**: Single-click interaction model with proper visual feedback and state cycling

### Paragraph-Aware Terminal Insertion
- **Respects Paragraph Boundaries**: Terminal punctuation only added at paragraph ends, not arbitrary positions
- **Suppresses Last Terminal**: No terminal punctuation added at the very end of the entire text block
- **Smart Fallback Logic**: Only adds terminals where needed, respecting existing punctuation

### Visual Improvements
- **Consistent Status Colors**: Green (ok), Amber (maybe), Red (bad) with proper Tailwind classes
- **Reactive UI**: All KPI cards update immediately when tokens or groups are clicked
- **Terminal Groups as Trio**: Punctuation suggestions render as three separate pills `^ . ^` (caret, dot, caret) grouped as a single clickable unit
- **Paragraph Spacing**: Paragraphs are visually separated (Tailwind `mb-4`), while end-of-paragraph terminal groups remain attached to the last word of the paragraph

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Boot the local stack (Postgres, LanguageTool, fixer, Llama, etc.):
   ```bash
   cd ../server
   docker compose up -d
   ```
   The compose file exposes defaults that let the app reach services at `http://localhost:5432`, `:8010`, `:8085`, and `:11434`.

3. Configure database access for the Next.js app:
   - Create `.env.local` in `silver-umbrella/` (if it does not already exist)
   - Add `DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<db>` matching the credentials in `server/.env`
   - Optional overrides: `FIXER_URL`, `LT_BASE_URL`, or `OLLAMA_URL` if you expose the services on different ports/hosts.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

### Optional: Tesseract OCR Notes

- OCR is self-contained—no Google Cloud credentials required. The API route embeds the `eng` language data and runs entirely locally.
- To add additional tessdata languages, supply `TESSDATA_PREFIX` or mount extra traineddata files and set `TESS_LANG` in `.env.local`.

#### Notes on Scanned Word Hover Previews
- The server returns the preprocessed image alongside the word-level bounding boxes so coordinates match what Tesseract processed.
- The client aligns OCR words to the combined text and lazily crops the matching word region for hover popovers.
- Editing the text after OCR clears previews (offsets no longer match the OCR baseline).

### Developer tips

- Clear Next.js build cache and restart dev server:
  ```bash
  rm -rf .next && npm run dev
  ```
  If port 3000 is stuck:
  ```bash
  lsof -ti :3000 | xargs kill -9 && rm -rf .next && npm run dev
  ```

## Development Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production (includes license compliance check)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run tests with Vitest UI
- `npm run test:run` - Run tests in command line mode
- `npm run size:report` - Analyze dependency sizes (shows top 30 largest packages)
- `npm run analyze` - Generate bundle analysis reports (requires ANALYZE=1)

### Relevant API Routes
- `POST /api/ocr` — Tesseract OCR. Body (JSON): `{ imageBase64?: string, imageUri?: string, lang?: string }`. Returns `{ text, raw }`.
- `GET /api/submissions`, `POST /api/submissions`, `GET /api/submissions/:id` — Manage writing samples.

## Usage
1. Paste student writing in the text area
2. Set the probe time duration (mm:ss format) for fluency calculations
3. LanguageTool provides professional spell checking and grammar analysis via API
4. Grammar checking runs automatically as you type (debounced)
5. Review the 6 key metrics in the right column grid
6. Review the aggregated infractions and suggestions (always visible) — driven purely by LanguageTool, grouped by type + replacement with counts, and ordered from most to fewest
7. Use interactive overrides to adjust scoring as needed (click words for WSC; clicking a word also synchronizes the two adjacent carets to match the word; click carets to cycle CWS)
8. Drag words or individual carets into the Discard panel to remove them from the stream and KPIs; use Undo to restore
9. Capitalization issues are treated as errors (red) but the original word casing is preserved in the bubble
10. The blue Output Text box shows LanguageTool's full corrected text for quick review

<!-- Spelling tab removed -->

## Technical Implementation

- Built with Next.js 15, React 18, and TypeScript
- Uses Framer Motion for animations
- Tailwind CSS for styling (with safelisted dynamic classes)
  - Responsive container sizing with `max-w-screen-xl 2xl:max-w-screen-2xl`
  - Discard-aware body padding via `.with-discard-pad` (at `xl+`), driven by CSS variables in `src/app/globals.css`
- Lucide React for icons
- Modular UI components with shadcn/ui design system
- Optimized for production with standalone output and minimal runtime bundles
- Modern TypeScript configuration (ES2022 target) for better performance
- ESLint configuration aligned with Next.js 15
- Bundle analyzer integration for performance monitoring

### Recent Test & Parity Improvements

- LT caret handling: more tolerant capitalization detection for `UPPERCASE_SENTENCE_START` with robust token anchoring when offsets vary.
- VT insertion compatibility: `convertLTTerminalsToInsertions` now supports both `(text, tokens, issues)` and `(tokens, issues)` signatures and falls back to the previous WORD boundary when an explicit caret is absent.
- No local heuristics at runtime: spelling/capitalization highlighting is based solely on LanguageTool edits. A banner appears if LanguageTool is unavailable.

### Punctuation Handling

- Missing terminal punctuation is indicated by caret flags at boundaries. Carets are clickable and keyboard-accessible for overrides.
- Commas and non‑sentence punctuation do not affect CWS.
- Paragraphs without terminal punctuation are still considered; end-of-text carets can be flagged.

### Capitalization Treatment

- Capitalization fixes returned by LanguageTool (pure case‑change replacements) are treated as errors (red) but do not change the bubble text (original casing is shown).
- Caret highlighting derives from adjacent token states; both carets around an error reflect the token’s severity.

## Scoring Guidelines

- **TWW**: All words written; include misspellings; exclude numerals
- **WSC**: Words spelled correctly in isolation (LanguageTool + custom lexicon)
- **CWS**: Adjacent units (words & essential punctuation). Commas excluded. Initial valid word counts 1. Capitalize after terminals
<!-- CLS removed -->

### Derived Metrics

The application now calculates additional metrics for comprehensive writing assessment:

- **CIWS (Correct Incorrect Writing Sequences)**: CWS minus IWS, providing a measure of writing accuracy
- **%CWS**: Percentage of CWS out of eligible boundaries, showing writing sequence accuracy
- **CWS/min**: Writing fluency rate calculated as CWS per minute when time is specified
- **IWS (Incorrect Writing Sequences)**: Eligible boundaries minus CWS count
- **Time Control**: Configurable probe duration in mm:ss format for accurate fluency calculations

### IWS Categorization

Incorrect Writing Sequences are categorized by reason for targeted instruction:

- **CAPITALIZATION**: Missing capital letters after sentence-ending punctuation
- **SPELLING**: Spelling errors that break writing sequences
- **PUNCTUATION**: Non-essential punctuation that breaks sequences
- **PAIR**: Invalid unit adjacencies or other mechanical issues

### CWS Engine Details

The CWS (Correct Writing Sequences) engine implements strictly mechanical, CBM-aligned scoring:

- **Essential Punctuation**: Only `.`, `!`, `?`, `:`, `;` participate in CWS scoring
- **Comma Exclusion**: Commas and other non-essential punctuation are ignored entirely
- **Boundary Rules**:
  - WORD↔WORD: Both words must be spelled correctly
  - WORD→TERMINAL: The word must be spelled correctly
  - TERMINAL→WORD: Next word must be capitalized AND spelled correctly
  - Initial boundary: Counts when first word is spelled correctly and capitalized
- **Visual Indicators**: Color-coded carets (^) show boundary status:
  - Green: Valid CWS boundary
  - Red: Invalid boundary (spelling/capitalization issue)
  - Yellow: Advisory hint from LanguageTool grammar checking
  - Muted: Non-eligible boundary (comma/quote/etc.)
- **Interactive Overrides**: Click carets to cycle through yellow (advisory)→red (incorrect)→green (correct)→yellow (default)
- **Character Position Tracking**: Token offsets enable precise alignment of LanguageTool issues to CWS boundaries

## Spell Checking & Grammar

### LanguageTool Integration
- **Self-hosted Spell Checking**: Uses the dockerized LanguageTool service that ships with the stack (no external API traffic)
- **Enhanced Spelling Detection**: Neural network-based detection for typos and grammar issues
- **Language Variant Support**: Uses `en-US` variant for optimal spelling and grammar detection
- **Complete Category Support**: Processes all standard grammar categories (spelling, grammar, style, punctuation)
- **Intelligent Rule Mapping**: Maps grammar issues to user-friendly messages
- **Development Debugging**: Console logging for LanguageTool parity checks
- **Automatic Grammar Checking**: Grammar analysis runs automatically as you type with debounce
- **Status Tracking**: Visual badge shows LanguageTool spell checking mode
- **Spelling Suggestions**: Built-in LanguageTool suggestion engine for misspelled words
- **Tooltip Integration**: Suggestions appear in word tooltips when words are flagged
- **Spell Result Caching**: Intelligent in-memory caching for LanguageTool responses
- **Rate Limiting**: Graceful retries if the local service returns HTTP 429/503 while starting up
- **Request Cancellation**: AbortSignal support for canceling stale requests
- **Correction Preview**: Shows LanguageTool's suggested correction for sanity checking
- **Capitalization Toggle**: Option to show/hide capitalization fixes in infractions

### LanguageTool Grammar
- **Automatic Grammar Checking**: Runs automatically as you type with 800ms debounce
- **Request Cancellation**: AbortSignal support prevents stale grammar check results
- **Service Proxy**: Next.js API routes call the dockerized LanguageTool/fixer services via internal URLs (no credentials required)
- **Advisory-only suggestions** (doesn't affect CBM scores)
- **Status Indicators**: Visual feedback showing grammar check status (idle/checking/ok/error)
- **CWS Boundary Mapping**: Grammar issues mapped to nearest CWS boundaries
- **Advisory Hints**: Grammar suggestions shown as yellow carets and advisory infractions
- **Smart Filtering**: Only grammar issues (not spelling/punctuation) mapped to boundaries
- **Grammar Mode Badge**: Always-visible indicator showing current grammar configuration
- **Debug Parity Assert**: Verifies that applying all LanguageTool edits reproduces the correction

### GB Token Annotation System
- **Visual Token Highlighting**: Color-coded token pills show GB analysis results:
  - **Green Pills**: Correct tokens with no issues
  - **Yellow Pills**: Possible grammar suggestions from GB
  - **Red Pills**: Incorrect spelling errors from GB
  - **Capitalization & Word Substitutions**: Wide GRMR edits that capitalize the first word and clear word substitutions (e.g., go→went) are treated as incorrect (red)
- **Caret Row Display**: Visual caret indicators above tokens showing GB-proposed terminal punctuation:
  - **Ghost Carets**: Faint carets for default boundaries
  - **Active Carets**: Highlighted carets for GB-proposed terminals
- **Capitalization Overlays**: Optional display of capitalization fixes without changing source text
- **Terminal Dots**: Visual indicators for punctuation insertions from GB analysis
- **Enhanced Infractions**: LT + Llama infractions panel with proper GRMR/SPELL/PUNC tagging and aggregated counts
- **Interactive Tooltips**: Hover over tokens to see rule labels and suggestions (e.g., Capitalization, Grammar → were, Spelling → friend). Instant display with a subtle pop‑in animation.
- **Debug Logging**: Console output for development debugging with `__CBM_DEBUG__` flag

### GB Insertion Display System
- **Insertion Pills**: Blue pills show suggested punctuation insertions from LanguageTool:
  - **Light Blue Pills**: Display the exact punctuation GB suggests (`.`, `!`, `?`)
  - **Rounded Design**: Distinctive pill styling to differentiate from token pills
  - **Boundary Grouping**: Insertions grouped by boundary index for proper placement
- **Synthetic Carets**: Additional carets after each insertion to close the group:
  - **Visual Pattern**: Shows `^ . ^` pattern for each suggested insertion
  - **Proper Spacing**: `caret-sibling` class provides optimal visual spacing
  - **Group Closure**: Each insertion group is properly closed with a synthetic caret
- **Interleaved Display**: Seamless integration with existing token and caret display:
  - **Boundary-First**: Caret at boundary, then insertions, then synthetic caret, then token
  - **End-of-Text Support**: Handles final insertions at end-of-text boundary
  - **Responsive Layout**: Maintains flex-wrap behavior for different screen sizes
- **Accessibility**: Proper ARIA labels for screen readers and keyboard navigation
 - **Robust INSERT Parsing**: Accepts PUNC INSERT replacements that include spaces (e.g., ". ") by extracting the first sentence terminator (., !, ?).
- **Tooltips for Terminals**: Carets and dots show terminal proposals (e.g., `Terminal → .`) with the same pop‑in animation.

### Tooltip Implementation

- **CSS‑only**: Implemented via `data-tip` attributes and styles in `src/app/globals.css` (`.tt[data-tip]`).
- **Timing**: Slight hover delay (~80ms) with fade/scale pop‑in; also appears on keyboard focus for accessibility.
- **Scope**: Applied to tokens, terminal dots, and carets so users can discover why items are red/amber and what punctuation is proposed.

### Infractions Panel
- **Aggregation**: Identical GB infractions are grouped by tag (e.g., `PUNC`, `SPELL`, `GRMR`) and replacement character/text (if any).
- **Counts**: Each row shows a frequency badge like `10×` followed by the tag and optional `→ replacement`.
- **Ordering**: Rows are sorted by count (desc), then by tag to keep the list concise and scannable.
- **Scope**: Display is derived directly from `gb.edits` (no heuristics), ensuring parity with LanguageTool output while staying compact.

### GB Enhancement Features (v3.1)
- **Clean Punctuation Highlighting**: Words before punctuation insertions are no longer highlighted, providing cleaner visual feedback
- **Interactive Insertion Dots**: Punctuation insertion dots (`.`, `!`, `?`) are now fully clickable and keyboard accessible:
  - **Mouse Support**: Click to focus and interact with insertion suggestions
  - **Keyboard Navigation**: Tab to focus, Enter/Space to activate
  - **Visual Focus Indicators**: Yellow focus ring for accessibility compliance
- **Paragraph-Aware Layout**: Enhanced support for multi-paragraph text:
  - **Automatic Paragraph Detection**: Recognizes carriage returns and line breaks in source text
  - **Separate Paragraph Rows**: Each paragraph renders on its own visual row
  - **Smart Fallback Punctuation**: Adds periods at paragraph boundaries where GB didn't suggest punctuation
  - **End-of-Text Filtering**: Properly excludes punctuation suggestions at the very end of text
- **Improved Boundary Mapping**: Better character offset to boundary index conversion for accurate placement

### LanguageTool Integration (Legacy)
- **API-based Spell Checking**: Uses LanguageTool's public API for professional spell checking
- **Enhanced Spelling Detection**: Properly configured to detect typos (MORFOLOGIK_RULE_* patterns) alongside grammar issues
- **Language Variant Support**: Uses `en-US` variant and `preferredVariants` for auto-detection to ensure spelling rules remain active
- **Website Parity**: Matches LanguageTool website defaults with `level=default` parameter
- **Complete Category Support**: Processes all standard LT categories (TYPOS, CAPITALIZATION, PUNCTUATION, TYPOGRAPHY, GRAMMAR, STYLE, SEMANTICS)
- **Intelligent Rule Mapping**: Maps common rules to user-friendly messages (UPPERCASE_SENTENCE_START, PUNCTUATION_PARAGRAPH_END, TOO_LONG_SENTENCE)
- **Development Debugging**: Console logging for LT parity checks to verify results match the LanguageTool website
- **Automatic Grammar Checking**: Grammar analysis runs automatically as you type with debounce
- **Status Tracking**: Visual badge shows LanguageTool spell checking mode
- **Spelling Suggestions**: Built-in LanguageTool suggestion engine for misspelled words
- **Tooltip Integration**: Suggestions appear in word tooltips when words are flagged
- **Spell Result Caching**: Intelligent in-memory caching for LanguageTool API responses
- **Rate Limiting**: Automatic exponential backoff for API rate limits
- **Request Cancellation**: AbortSignal support for canceling stale requests

### LanguageTool + Heuristics Pipeline
- **Self-hosted grammar stack**: `/api/languagetool` proxies to the dockerized LanguageTool container, appends fixer rules, and normalizes match fields so the UI can reason about corrections consistently.
- **CBM heuristics layer**: `analyzeText()` (see `src/lib/cbmHeuristics.ts`) tokenizes drafts, detects sentence boundaries, classifies numbers, and flags rubric-aligned infractions (e.g., missing capitals, fused sentences, unmatched wrappers).
- **Context aware dictionaries**: `src/data/cbmDictionaries.ts` seeds abbreviations, proper nouns, and the default lexicon; teachers can extend these sets via `HeuristicsOptions` when wiring custom deployments.
- **Verifier API**: `/api/verifier` merges LanguageTool edits and heuristic findings, selects up to `LLAMA_MAX_WINDOWS` sentence windows, and asks the local Ollama model to confirm or veto high-risk changes.
- **LLM guardrails**: Disable Llama checks by setting `LLAMA_SANITY_DISABLED=1` or `LLAMA_SANITY_CHECK=false`; otherwise findings surface in the infractions drawer with `source: "llama"` tags.

### Caret-Only Terminal Handling
- **Boundary states**: Carets track `ok/maybe/bad` status per boundary; clicking a word syncs both adjacent carets to the word’s state, keeping CWS calculations aligned.
- **Manual overrides**: Clicking a caret cycles its state; removed carets (dragged into the discard lane) no longer block CWS but remain available through Undo.
- **Discard workflow**: Tokens and carets can be dragged left to the discard panel; an Undo stack restores the last action and recomputes KPIs immediately.
- **KPI integration**: `computeKpis()` consumes token states, discard flags, and caret statuses to refresh TWW/WSC/CWS metrics in real time.
- **Infractions pane**: Aggregated issues from LanguageTool, heuristics, and Llama display with severity pills so teachers can triage quickly.

### Legacy Terminal Group System (Removed)
Earlier versions bundled caret triplets into “terminal groups.” The component still exists for reference, but the production UI now operates strictly on individual carets and heuristics-driven boundaries. See the v8.x notes in this README if you need historical context.

## Deployment

### Netlify Deployment (Recommended)

The application is configured for optimal Netlify deployment:

1. **Automatic Build**: Netlify will run `npm run build` automatically
2. **API Functions**: Server routes (LanguageTool proxy, OCR, PDF worker) run as Netlify Functions
3. **Environment Variables**: Configure these in Netlify → Site settings → Build & deploy → Environment:
   - `LANGUAGETOOL_API_KEY` — LanguageTool cloud key
   - Database URL — one of: `NETLIFY_DATABASE_URL` (preferred) or `NEON_DATABASE_URL` or `DATABASE_URL`
   - Tesseract OCR (recommended names used by the app):
     - `GCP_PROJECT_ID` — GCP project id
     - `GCP_CLIENT_EMAIL` — service account email
     - `GCP_PRIVATE_KEY` — private key string; you may paste with real newlines or with `\n` escapes (both supported)
   - Optional fallbacks also supported: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_SA_EMAIL`
4. **Secrets Scanning**: Netlify blocks builds if secrets are detected in repo files or build output.
   - We do not commit secrets in this repo; if you hit false positives (often in docs), the repo includes sane defaults in `netlify.toml`:
     - `SECRETS_SCAN_OMIT_PATHS="README.md,CHANGELOG.md,codemap.md"`
     - `SECRETS_SCAN_OMIT_KEYS="GCP_PRIVATE_KEY,GOOGLE_APPLICATION_CREDENTIALS_JSON,NETLIFY_DATABASE_URL,NEON_DATABASE_URL,DATABASE_URL,LANGUAGETOOL_API_KEY"`
   - If necessary, you can disable scanning from the Netlify UI by setting `SECRETS_SCAN_ENABLED=false` (not recommended long‑term).
4. **Configuration**: Uses `netlify.toml` with Next.js plugin for proper function deployment

### Apache + Cloudflare Tunnel Frontend

For the district instance, Apache serves as a thin front door that forwards visitors from `https://autocbm.com/` to the internal Next.js dev server via a Cloudflare tunnel.

1. Keep the tunnel process active so `autocbm.com` resolves to the Cloudflare hostname (`c500f01a-fa89-4773-b3c4-55ae5d8e716b.cfargotunnel.com`).
2. Update the Apache document root (`/Library/WebServer/Documents/index.html`) to redirect to the tunnel target and unregister any legacy service workers:
   ```bash
   cat <<'HTML' | sudo tee /Library/WebServer/Documents/index.html >/dev/null
   <!DOCTYPE html>
   <html lang="en">
     <head>
       <meta charset="utf-8" />
       <title>CBM Webtool</title>
       <meta http-equiv="refresh" content="1; url=https://c500f01a-fa89-4773-b3c4-55ae5d8e716b.cfargotunnel.com/" />
       <style>
         body { font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #0d1117; color: #f0f6fc; }
         a { color: #58a6ff; text-decoration: none; font-size: 1.1rem; }
         a:hover { text-decoration: underline; }
       </style>
     </head>
     <body>
       <p>Redirecting to the CBM Webtool… <a href="https://c500f01a-fa89-4773-b3c4-55ae5d8e716b.cfargotunnel.com/">Continue</a></p>
       <script>
         (function redirect() {
           if ('serviceWorker' in navigator) {
             navigator.serviceWorker.getRegistrations().then(registrations => {
               registrations.forEach(reg => reg.unregister().catch(() => {}));
             }).catch(() => {});
           }
           setTimeout(() => {
             window.location.replace('https://c500f01a-fa89-4773-b3c4-55ae5d8e716b.cfargotunnel.com/');
           }, 100);
         })();
       </script>
     </body>
   </html>
   HTML
   ```
3. Restart Apache if needed: `sudo apachectl graceful`.
4. Verify the redirect by visiting `https://autocbm.com/` and ensuring the Next.js UI responds on the tunneled host.

The same HTML redirect lives in version control under `docs/apache-index.html` if you prefer to copy it directly.

### Production Build

The application is optimized for production deployment with minimal runtime requirements:

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Deploy these directories only:**
   - `.next/standalone/` - Contains the server and minimal dependencies
   - `.next/static/` - Static assets
   - `public/` - Public files

3. **Run the production server:**
   ```bash
   node .next/standalone/server.js
   ```

### Optimization Features

- **Standalone Output**: Minimal runtime bundle with only production dependencies
- **Unoptimized Images**: Skips sharp binary dependencies for faster deployments
- **Immutable Caching**: Dictionary files cached with 1-year expiration for performance
- **Bundle Analysis**: Use `npm run analyze` to generate detailed bundle size reports
- **Dependency Analysis**: Use `npm run size:report` to identify large packages
- **Modern TypeScript**: ES2022 target for better performance and WASM compatibility
- **Spell Result Caching**: In-memory caching eliminates repeated spell checks

## Privacy & Compliance

### FERPA/COPPA Considerations
- **Local processing**: Grammar, OCR, and LLM validation all run on the self-hosted stack (Postgres, LanguageTool, fixer, Tesseract, Ollama). No student text leaves your infrastructure.
- **Granular storage**: Submissions and prompts live in Postgres; generator snapshots are optional and can be purged independently.
- **Session reset**: One-click “Clear session data” removes local state for shared workstations.

### Privacy Controls
- **Stack visibility**: Status badges surface when LanguageTool/fixer/Ollama are offline so you know when checks fall back to manual review.
- **Clear session data**: Complete reset of all settings and student text with one action.
- **Backup discipline**: `server/backup.sh` syncs workspace and MinIO buckets to Backblaze with explicit excludes so student uploads remain under district control.

### License Compliance
- **LanguageTool**: Uses the AGPL-licensed docker image (`silviof/docker-languagetool`). Attribution retained in the stack docs.
- **Ollama/Llama**: Refer to the upstream model license when loading additional weights; defaults to community Llama 3.1 (8B).
- **Tesseract.js**: Distributed under Apache 2.0; LICENSE bundled in `node_modules/tesseract.js`.

## Debugging

### Enhanced Debug System

The application includes a comprehensive debug logging system with multiple ways to enable debug mode for troubleshooting issues with the terminal group pipeline:

#### Enabling Debug Logs

**Method 1: URL Parameter (Recommended)**
1. Add `?debug=1` to your URL (e.g., `http://localhost:3000?debug=1`)
2. Debug mode will be enabled and persisted in localStorage
3. Console will show: `[CBM] debug enabled via ?debug=1`

**Method 2: Browser Console**
1. Open the browser console (F12)
2. Run: `window.__CBM_DEBUG__ = true`
3. Reload the page

**Method 3: Environment Variable (Production/Preview)**
1. Set `NEXT_PUBLIC_CBM_DEBUG=1` in your environment
2. Useful for Netlify preview deploys and production debugging

**Method 4: Persistent Storage**
1. Once enabled via URL parameter, debug mode persists in localStorage
2. Debug mode will automatically re-enable on subsequent visits

#### Debug Information Available

- **LT Request/Response**: LanguageTool API calls with request details and response breakdowns
- **Raw LT Response Caching**: Complete LT responses cached in `window.__LT_LAST__` for DevTools inspection
- **Pretty Console Tables**: Formatted tables showing all LT issues with details (rule ID, category, message, offset, length, text, replacements)
- **Rule Grouping Summary**: Counts of issues grouped by rule type for quick overview
- **Tokenization**: Token details, LT boundary hints, and issue mapping
- **Heuristic Insertions**: Proposed virtual terminal insertions with reasoning
- **Group Building**: Virtual terminal group creation and mapping process
- **Display Stream**: Virtual terminal insertion into the display token stream
- **Map Population**: vtByDotIndex and vtByBoundary map creation
- **Click Paths**: Dot clicks and suggestion row clicks with group lookups

#### Debug Output Format

Debug logs use structured console output:
- `console.groupCollapsed()` for organized sections
- `console.table()` for tabular data with all LT issue details
- `dlog()` for structured logging
- Clear prefixes like `[LT]`, `[VT]`, `[CWS/LT]` for easy filtering

#### LanguageTool Debugging Features

**Raw Response Inspection**
- Access the latest LT response anytime with `window.__LT_LAST__` in DevTools console
- Complete raw JSON response cached for detailed inspection
- Structured logging prevents circular reference issues

**Comprehensive Issue Logging**
- `[LT] request` - Shows request details (language, text length, sample)
- `[LT] raw` - Full structured response (no circular refs)
- `[LT] issues (count)` - Number of issues found
- Formatted table with columns: id, category, msg, offset, length, text, reps
- `[LT] by rule` - Summary grouped by rule type

**Field-Agnostic Processing**
- Robust field shims handle different LT server response formats
- Supports various field names: `ruleId`/`rule.id`/`id`, `categoryId`/`rule.category.id`/`category`
- Handles different offset/length field variations
- Extracts replacement suggestions from various response structures

#### Troubleshooting Terminal Groups

If virtual terminal groups are not appearing or functioning correctly:

1. Enable debug logging
2. Look for `[VT] ✖ could not locate dot for insertion` messages
3. Check if `vtByDotIndex` and `vtByBoundary` maps are populated
4. Verify LT response contains punctuation/grammar matches
5. Check if heuristic insertions are being proposed correctly
6. Inspect `window.__LT_LAST__` to see the raw LT response
7. Review the formatted issue table for rule details and positioning

## Testing

### Test Suite
- **Vitest Integration**: Modern testing framework with UI and CLI modes
- **Golden Tests**: Comprehensive test coverage for CWS rule validation
- **Rule Validation**: Tests for initial-word credit, terminal capitalization, comma handling
- **Edge Cases**: Tests for quotes, parentheses, hyphens, apostrophes, and numerals
- **Virtual Terminal Tests**: Tests for missing punctuation detection, Figure 4 behavior, and group cycling
- **Behavior Locking**: Golden tests ensure virtual terminal cycling behavior remains consistent
- **Continuous Integration**: Tests run automatically on build

### Test Commands
- `npm run test` - Run tests with interactive Vitest UI
- `npm run test:run` - Run tests in command line mode
- Tests validate core CWS scoring rules and edge cases

## Extensibility

The tool is designed for easy extension:
- **LanguageTool API**: Professional spell checking and grammar analysis with neural network support
- **Multi-language Ready**: LanguageTool supports multiple languages with neural processing
- **Advanced Grammar**: Neural network-based grammar checking with high accuracy
- **API Extensions**: Easy integration with additional language services
- **Performance Optimization**: Intelligent caching and request management
- **Export Extensions**: Easy to add new export formats (JSON, XML, etc.)
- **Privacy Extensions**: Framework for additional privacy controls and compliance features

## Recent Updates

## Dev Troubleshooting

- Clean dev cache: stop the server and remove `.next` before restarting (`rm -rf .next && npm run dev`).
- Workspace root: `next.config.js` sets `outputFileTracingRoot` to this project to avoid parent lockfile mis‑detection.
- Port in use: if `:3000` is busy, run production locally with `npm run build && npm run start -p 3010`.

### Latest Improvements (v8.0) - Comprehensive State Management System
- **Token Component**: Created `src/components/Token.tsx` with proper state classes (`state-ok`, `state-maybe`, `state-bad`) and data attributes
- **TerminalGroup Component**: Updated `src/components/TerminalGroup.tsx` to use new state management structure with proper CSS classes
- **State CSS Variables**: Added comprehensive state CSS with CSS custom properties (`--c`, `--bg`, `--fg`) as single source of truth for colors
- **Immutable State Management**: Implemented `useTokensAndGroups` hook with `useCallback` for immutable state updates using `map()` instead of mutations
- **Automatic KPI Recomputation**: Added `useKPIs` hook with `useEffect` that automatically recomputes KPIs when token or group states change
- **Initial State Application**: Enhanced `bootstrapStatesFromGB` to properly apply initial states from GB edits to tokens and groups
- **Debug Logging**: Added temporary debug console.log statements to verify state application and track changes
- **State Cycling**: Implemented proper cycling order: green → yellow → red → green (ok → maybe → bad → ok) for both words and terminal groups
- **CSS Integration**: Comprehensive styling system with state-specific colors and proper inheritance for terminal group children
- **Component Architecture**: Clean separation between Token and TerminalGroup components with proper interfaces and type safety
- **Real-time Updates**: All state changes trigger automatic KPI recalculation and UI updates without manual intervention

### Previous Improvements (v6.3) - GB Insertion Display System
- **GB Insertion Pills**: New blue pill system displays suggested punctuation insertions from LanguageTool
- **Synthetic Caret System**: Additional carets after each insertion create proper visual grouping (`^ . ^` pattern)
- **Boundary Grouping**: `groupInsertionsByBoundary()` function organizes insertions by boundary index
- **Interleaved Display**: Seamless integration with existing token and caret display system
- **End-of-Text Support**: Proper handling of final insertions at end-of-text boundary
- **Responsive Design**: Maintains flex-wrap behavior and accessibility features
- **CSS Enhancement**: Added `.pill-insert` and `.caret-sibling` styles for optimal visual presentation
- **Type Safety**: Full TypeScript support with proper type definitions for insertion cells
- **Test Coverage**: Comprehensive test suite for boundary grouping functionality

### Previous Improvements (v6.2) - GB Token Annotation & Visual Enhancement
- **GB Token Annotation**: New visual token highlighting system with color-coded pills (green=correct, yellow=possible, red=incorrect)
- **Caret Row Display**: Visual caret indicators above tokens showing GB-proposed terminal punctuation positions
- **Capitalization Overlays**: Optional display of capitalization fixes without changing source text
- **Terminal Dots**: Visual indicators for punctuation insertions from GB analysis
- **Enhanced Infractions**: LT + Llama infractions panel with proper GRMR/SPELL/PUNC tagging
- **Interactive Tooltips**: Hover over tokens to see error categories and suggestions
- **Debug Logging**: Console output for development debugging with `__CBM_DEBUG__` flag
- **New Annotation Module**: Created `src/lib/gbAnnotate.ts` with `annotateFromGb` and `buildCaretRow` functions
- **CSS Styling**: Added comprehensive styles for caret states and token pill colors
- **UI Integration**: Seamless integration with existing token display and infractions panel

### Previous Improvements (v6.1) - LanguageTool Migration Polish
- **Complete Migration**: Finished shifting from any hosted grammar API to the self-hosted LanguageTool + fixer containers with local Llama verification
- **Neural Network Processing**: LanguageTool still runs with neural rules enabled for enhanced accuracy
- **Service Proxy**: Hardened the API routes that talk to LanguageTool/fixer/Redis inside the docker network
- **Simplified Architecture**: Removed all LanguageTool code, rule filters, and LT→VT paths
- **Enhanced Performance**: Streamlined grammar checking with neural network processing
- **Updated UI**: All labels now show "LT + Llama" and "LanguageTool" instead of LT references
- **Pure GB Infractions**: Infractions list now renders directly from gb.edits with proper mapping
- **Rate Limiting**: Added simple backoff handling for LanguageTool 429 responses
- **Correction Preview**: Added LanguageTool correction preview banner for sanity checking
- **Capitalization Toggle**: Added toggle to show/hide capitalization fixes in infractions
- **Debug Parity Assert**: Added assertion that GB edits reproduce response.correction
- **Offline First**: Removed reliance on external API keys; all grammar runs stay local
- **Maintained Compatibility**: All existing features work seamlessly with LanguageTool

### Previous Improvements (v6.0) - LanguageTool Integration
- **Initial Migration**: Began the move away from hosted grammar APIs toward LanguageTool running in Docker with local Llama review
- **Neural Network Processing**: Enabled LanguageTool's neural rule set for higher accuracy
- **Service Proxy**: Added API routes that forward to the internal LanguageTool endpoint
- **Simplified Architecture**: Removed legacy hosted grammar configuration and rule filters
- **Enhanced Performance**: Streamlined grammar checking with local container latency
- **Updated UI**: All labels and indicators now reflect the LanguageTool integration
- **Offline Ready**: Documented fallback defaults so development works without internet access
- **Maintained Compatibility**: All existing features work seamlessly with LanguageTool

### Previous Improvements (v5.2) - API Proxy Rule Filtering Fix
- **Fixed Rule Filtering**: Updated API proxy to properly handle form data and prevent artificial rule restrictions
- **Full Grammar Checking**: Client now explicitly requests comprehensive checks with `level=default` and `enabledOnly=false`
- **Enhanced Debug Logging**: Added detailed request parameter logging and match count tracking
- **Form Data Processing**: API proxy now uses `req.formData()` instead of `req.text()` for proper parameter handling
- **Rule Parameter Cleanup**: Explicitly removes `enabledCategories`, `enabledRules`, `disabledCategories`, and `disabledRules` unless client sends them
- **Client Parameter Enhancement**: Updated `checkWithLT()` to include proper parameters for full grammar checking
- **Debug Visibility**: Enhanced logging shows all request parameters and response match counts for troubleshooting

### Previous Improvements (v5.1) - Enhanced LanguageTool Debugging
- **Raw LT Response Logging**: Added comprehensive logging of LanguageTool API requests and responses with debug mode
- **Response Caching**: Latest LT response cached in `window.__LT_LAST__` for DevTools inspection
- **Pretty Console Tables**: Formatted console.table output showing all LT issues with detailed breakdowns
- **Field-Agnostic Processing**: Enhanced field shims (`ltMsg`, `ltReps`) to handle various LT server response formats
- **Rule Grouping Summary**: Added rule-based grouping counts for quick issue overview
- **Debug Integration**: Seamless integration with existing debug system using `__CBM_DEBUG__` flag
- **DevTools Access**: Easy access to raw responses via `window.__LT_LAST__` for detailed inspection
- **Structured Logging**: Prevents circular reference issues with proper JSON serialization
- **Enhanced Troubleshooting**: Comprehensive debugging information for LT issue analysis and terminal group troubleshooting

### Previous Improvements (v5.0) - LT-Only Architecture Refactoring
- **Complete Architecture Overhaul**: Redesigned the entire codebase to use only LanguageTool for terminal punctuation suggestions
- **Eliminated Heuristic Logic**: Removed all heuristic-based detection including paragraph-end rules, capitalization heuristics, and smart comma detection
- **Minimal Rule Processing**: Now only processes three specific LT rules: `UPPERCASE_SENTENCE_START`, `MISSING_SENTENCE_TERMINATOR`, and `PUNCTUATION_PARAGRAPH_END`
- **Robust Field Shims**: Added tolerant field accessors (`ltRuleId`, `ltCategory`, `ltOffset`, `ltLength`, `ltMarked`) that handle different LT server response formats
- **Caret-Aware Boundary Logic**: Advanced boundary detection that places terminals using caret ("^") ownership for proper VT integration
- **Simple Tokenizer**: Clean tokenization that yields WORD/PUNCT/BOUNDARY tokens including caret markers
- **Streamlined Pipeline**: LT issues → filter → convert to insertions → display, with no complex fusion layers
- **Clean Codebase**: Removed 1000+ lines of complex heuristic logic, wrapper functions, and fusion layers
- **Proven Functionality**: Comprehensive test suite validates the LT-only pipeline works independently
- **Better Maintainability**: Single source of truth for terminal insertions (LanguageTool only)
- **Reduced Complexity**: Simplified UI and logic focused solely on LT results
- **New File Structure**: Created minimal, focused modules (`types.ts`, `ltClient.ts`, `ltFilter.ts`, `ltToVT.ts`, `tokenize.ts`)

### Previous Improvements (v4.5) - UPPERCASE Boundary-Aware Insertion
- **Boundary-Aware UPPERCASE Detection**: Enhanced UPPERCASE_SENTENCE_START processing that uses boundary caret ("^") ownership for proper VT integration
- **Helper Functions**: Added `isWord()`, `prevWordIndex()`, and `nearestBoundaryLeftOf()` for sophisticated boundary detection
- **VT Ownership System**: Virtual terminals now use `beforeBIndex: boundaryIdx` for boundary-based ownership instead of word-based positioning
- **Visual Position Accuracy**: Dots still render after the previous word (correct visual placement) while using boundary carets for VT grouping
- **Enhanced Debug Logging**: Added comprehensive console logging showing word indices, boundary indices, and insertion decisions
- **Guardrail Protection**: Prevents duplicate insertions and avoids placing terminals before opening quotes or existing terminals
- **Paragraph/Terminator Enhancement**: Applied same boundary-aware logic to paragraph-end and missing terminator rules
- **CWS Integration**: Ensures virtual terminals participate correctly in the `vtByBoundary`/grouping pipeline for proper teacher controls

### Previous Improvements (v4.4) - Robust Shims & Resilient Token Locator
- **Robust LT Field Shims**: Added comprehensive shim functions (`ltRuleId`, `ltCategoryId`, `ltMsg`, `ltOffset`, `ltLength`, `ltMarkedText`) that handle multiple LanguageTool server payload shapes
- **Resilient Token Locator**: Implemented `locateStartToken()` with three fallback strategies: (1) exact offset, (2) first word after offset, (3) by matched text
- **Enhanced Field Handling**: New `ltMarkedText()` function handles unusual cases where flagged text is provided in non-standard fields like `"len": "Nobody"`
- **Backward Compatibility**: Maintained legacy function aliases (`getRuleId`, `getCategoryId`, etc.) for seamless integration
- **Improved Converter**: Updated `convertLTTerminalsToInsertions()` to accept text parameter and use the new resilient locator
- **Diagnostic Support**: Added `debugLtToVt()` function that provides helpful diagnostics when no insertions are generated
- **Enhanced Error Handling**: Proper undefined checks for token start/end positions throughout the locator system
- **Cross-Server Robustness**: Works reliably with different LanguageTool server configurations and response formats

### Previous Improvements (v4.3) - Robust LT Issue Parsing & Field-Agnostic Processing
- **Field-Agnostic LT Parsing**: Added robust accessor functions (`getRuleId`, `getCategoryId`, `getMsg`, `getOffset`, `getLength`) that handle different LanguageTool server payload shapes
- **UPPERCASE_SENTENCE_START Enhancement**: Improved boundary detection that places terminals BEFORE capitalized words with offset-robust processing
- **Cross-Server Compatibility**: Works seamlessly with different LanguageTool server configurations and response formats
- **Enhanced Debug Logging**: Added comprehensive debug output showing filtered LT rules and virtual terminal counts
- **SSR Compatibility**: Fixed server-side rendering issues with proper `window` object guards
- **Improved Boundary Logic**: Enhanced UPPERCASE_SENTENCE_START processing with better token offset handling and boundary placement
- **LT-Only Mode Optimization**: Streamlined terminal insertion logic to use only LanguageTool analysis without heuristic fallbacks
- **Robust Error Handling**: Better handling of malformed or missing LT response fields

### Previous Improvements (v4.2) - UPPERCASE_SENTENCE_START Boundary Detection & LT-Only Infractions
- **UPPERCASE_SENTENCE_START Detection**: Implemented advanced boundary detection that places terminals BEFORE capitalized words identified by LanguageTool
- **Smart Boundary Placement**: Added sophisticated logic to avoid placing terminals before opening quotes, brackets, or existing terminals
- **Safety Guardrails**: Comprehensive checks prevent double-insertion and include validation for existing punctuation
- **LT-Only Infractions Toggle**: Added optional toggle to show only LanguageTool issues in the infractions panel for focused review
- **Enhanced Rule Filtering**: Strict filtering to only three specific LT rules: `PUNCTUATION_PARAGRAPH_END`, `MISSING_SENTENCE_TERMINATOR`, and `UPPERCASE_SENTENCE_START`
- **Improved User Experience**: Clear visual feedback and intuitive controls for teachers to review and accept/reject boundary suggestions
- **Reduced False Positives**: Eliminates spurious dots inside phrases like "... nobody could ..." while maintaining accurate boundary detection

### Previous Improvements (v4.1) - LT-Only Mode & Strict Boundary Detection
- **LT-Only Mode**: Implemented strict LanguageTool-only terminal boundary detection, eliminating heuristic-driven false positives
- **Strict LT Rules**: Now only reacts to specific LT rule families: `PUNCTUATION_PARAGRAPH_END`, `MISSING_SENTENCE_TERMINATOR`, and `UPPERCASE_SENTENCE_START`
- **Precise Caret Placement**: Fixed `convertLTTerminalsToInsertions()` to correctly place boundaries BEFORE capitalized words (e.g., after "forest" before "The")
- **Eliminated Heuristics**: Disabled paragraph-end and "CapitalAfterSpace" heuristics to show only LT-driven boundaries
- **Enhanced Console Logging**: Console now shows `{ lt: <N>, eop: 0, insertions: <N> }` confirming LT-only mode
- **Unit Test Coverage**: Added comprehensive test for LT caret placement verification
- **Reduced False Positives**: Spurious dots inside phrases like "... nobody could ..." are eliminated
- **LT Authority**: LanguageTool now has complete authority over terminal punctuation suggestions

### Previous Improvements (v4.0) - LT Boundary Integration & Virtual Terminal System
- **LT Boundary Integration**: Complete integration of LanguageTool boundary suggestions with CWS virtual terminal system
- **Virtual Terminal Insertions**: LT boundary suggestions are now converted to `VirtualTerminalInsertion` format for seamless integration
- **Smart Comma Filtering**: Enhanced comma filtering that preserves list commas while filtering clause-structuring commas for CWS
- **Paragraph-End Detection**: Robust paragraph-end punctuation detection as fallback when LT misses boundaries
- **LT-First Priority**: LanguageTool boundary detection runs first, with paragraph-end detection as fallback
- **Debug Table Integration**: Optional LT debug table showing rule IDs, categories, messages, and replacements when debug mode is enabled
- **Enhanced Boundary Detection**: Multi-signal boundary detection using replacement signals, message analysis, and structural patterns
- **Consistent Integration**: All LT boundary suggestions use the same `VirtualTerminalInsertion` format as heuristics
- **Smart Deduplication**: When LT and heuristics suggest the same boundary, LT takes precedence
- **Comprehensive Debug Logging**: Enhanced debug system with LT issue table and virtual terminal counts

### Previous Improvements (v3.9) - Smarter LT Boundary Extraction
- **Enhanced Multi-Signal Detection**: Completely rewritten `ltBoundaryInsertions()` with sophisticated boundary detection:
  - **Replacement Signals**: Detects when LT suggests adding terminal punctuation (`.`, `!`, `?`)
  - **Message Signals**: Analyzes LT messages for explicit boundary mentions using regex patterns
  - **Structural Signals**: Detects patterns like "forest The" with capitalized words following non-terminal words
- **Smart Category Filtering**: Added `BOUNDARY_CATEGORIES` set to filter relevant LT categories (PUNCTUATION, GRAMMAR, STYLE, TYPOGRAPHY)
- **Improved Comma Policy**: Enhanced `isCommaOnlyForCWS()` with better Oxford/serial comma preservation logic
- **Enhanced Token Analysis**: Improved `tokenIndexAt()` helper for precise character position to token mapping
- **Coordinating Conjunction Filtering**: Prevents false positives with conjunctions like "and", "or", "but", "so", "then", "yet"
- **Debug Logging**: Added conditional debug output for boundary detection troubleshooting with `window.__CBM_DEBUG__`
- **Efficient Deduplication**: Clean deduplication using `Set<number>` for `beforeBIndex` tracking
- **LT-First Priority**: LanguageTool boundary detection runs first, with paragraph-end detection as fallback
- **Type Safety**: Fixed TypeScript compatibility issues with proper union types for terminal insertions

### Previous Improvements (v3.7) - LT Authority & Debug Visibility
- **LT Authority Priority**: LanguageTool now provides authoritative terminal punctuation suggestions, with heuristics as fallback only
- **Debug Counts Logging**: Added comprehensive counts logging showing insertions, displayDots, and groups for troubleshooting
- **Display Stream Groups**: Groups are now built from the actual rendered display stream, guaranteeing `groups === displayDots`
- **False Positive Filtering**: Added filter to avoid "and I / Then I" false positives by skipping insertions before "I"
- **Enhanced Suggestion Clicks**: Improved suggestion row click handlers with proper boundary-to-group mapping
- **Stable Group System**: Groups remain stable across re-renders and mode switches
- **LT Boundary Detection**: LanguageTool issues are converted to terminal insertions with proper boundary mapping
- **Consistent Dot Rendering**: Virtual terminal dots render consistently whether using LT or heuristic detection

### Previous Improvements (v3.6) - Stable Virtual Terminal Group System
- **Stable Group Building**: Implemented `createVirtualTerminalsFromDisplay()` function that builds groups from rendered display tokens instead of insertion arrays
- **Re-render Stability**: Groups now remain stable across re-renders, even when insertion arrays become empty
- **LT Authority Integration**: Added `ltBoundaryInsertions()` function to convert LanguageTool issues into terminal insertion format
- **Consistent Dot Rendering**: Dot chips now render consistently whether using heuristic detection or LanguageTool analysis
- **Simplified Dependencies**: Virtual terminal groups now only depend on `displayTokens`, eliminating complex insertion-based dependencies
- **Enhanced LT Integration**: When LanguageTool is active, it provides authoritative terminal punctuation suggestions
- **Robust Boundary Detection**: Groups are built by scanning the actual rendered stream for virtual terminal punctuation
- **Improved User Experience**: Eliminates group disappearance issues during re-renders and mode switches

### Previous Improvements (v3.5) - Comprehensive Debug Logging System
- **Debug Logging Infrastructure**: Added comprehensive debug logging system to track terminal group pipeline
- **LT Request/Response Logging**: Detailed logging of LanguageTool API requests and responses with match breakdowns
- **Tokenization Debugging**: Logs token details, LT boundary hints, and issue mapping for troubleshooting
- **Heuristic Insertion Tracking**: Logs proposed virtual terminal insertions with boundary indices and reasoning
- **Group Building Debugging**: Detailed logging of virtual terminal group creation and mapping failures
- **Display Stream Verification**: Logs virtual terminal insertion into display token stream
- **Map Population Tracking**: Logs vtByDotIndex and vtByBoundary map creation and population
- **Click Path Debugging**: Logs dot clicks and suggestion row clicks with group lookup results
- **Runtime Debug Control**: Enable/disable debug logs via `window.__CBM_DEBUG__ = true` in browser console
- **Structured Logging**: Uses console.groupCollapsed, console.table, and structured data for easy debugging
- **Pipeline Visibility**: Complete end-to-end visibility into where terminal groups may be disappearing

### Previous Improvements (v3.4) - Virtual Terminal Boundary Mapping Fixes
- **Fixed Virtual Terminal Mapping**: Corrected `createVirtualTerminals` function to properly map virtual terminal groups to display token indices
- **Boundary Index Alignment**: Fixed boundary index calculation to ensure virtual terminal groups correctly correspond to their caret positions
- **Clickable Infraction Items**: TERMINAL (possible) items in the infractions panel are now clickable and toggle the entire virtual terminal group
- **Dual Interaction Methods**: Users can now toggle virtual terminal groups from both the text stream (virtual dots) and the infractions panel (TERMINAL items)
- **Improved User Experience**: Consistent interaction model across all virtual terminal interfaces
- **Boundary Lookup Optimization**: Added `vtByBoundary` memo for efficient boundary-to-group mapping
- **Enhanced Accessibility**: TERMINAL items show hover effects and tooltips when clickable

### Previous Improvements (v3.3) - Terminal Group System & Bulk Toggle Operations
- **Terminal Group System**: Revolutionary feature that groups LT punctuation/grammar issues with three related carets
- **Bulk Toggle Functionality**: One-click cycling of multiple carets simultaneously for efficient teacher workflow
- **Visual Group Highlighting**: Hover effects show which carets belong to each terminal group with blue ring highlighting
- **LT-Driven Grouping**: LanguageTool issues automatically create terminal groups with smart boundary detection
- **Three-Caret Structure**: Each group contains groupLeftCaret, primaryCaret, and groupRightCaret for comprehensive coverage
- **Suggestion Panel Integration**: Terminal groups appear as blue-themed suggestions in the infractions panel
- **Independent Operations**: Each terminal group operates independently without cross-coupling
- **Edge Case Handling**: Properly handles start-of-text and end-of-text boundaries
- **Smooth Transitions**: All visual changes use CSS transitions for polished user experience
- **Hover Preview**: Users can see which carets will be affected before clicking for better UX

### Previous Improvements (v3.2) - LanguageTool Parity Verification & Hardening
- **Request Profile Presets**: Added exact parity constants matching LT website (siteDefault, sitePicky, autoDetect)
- **No Pre/Post Processing**: Raw textarea values sent as-is to preserve offsets and trailing spaces/newlines
- **Token Offsets Smoke Test**: Dev-only hover badges showing [start,end] and overlapping rule IDs for debugging
- **Exact Deduplication**: Implemented precise deduplication with no category filtering to prevent duplicate issues
- **Robust Spelling Classification**: Enhanced spelling detection with both TYPOS category and MORFOLOGIK_RULE_* patterns
- **Shared Overlap Helper**: Unified `overlaps()` function used everywhere for consistent boundary detection
- **Expanded Rule Mapping**: Enhanced rule-to-UI mapping with common rules (PUNCTUATION_PARAGRAPH_END, UPPERCASE_SENTENCE_START, etc.)
- **Parity Test Protocol**: Dev helper for comparing panel results vs LT website with console logging
- **Jest Snapshot Tests**: Regression prevention tests for spelling errors, punctuation issues, and capitalization detection
- **Level Parameter Support**: Added picky mode toggle support for enhanced grammar checking
- **Development Tools**: Enhanced debugging capabilities with rule overlap detection and offset verification

### Previous Improvements (v3.1) - LanguageTool Parity & WSC Fixes
- **Fixed WSC Scoring**: Implemented proper character offset tokenization to fix Words Spelled Correctly detection
- **Enhanced LanguageTool Integration**: Updated API requests to use `language=en-US` and `preferredVariants=en-US` for proper spelling detection
- **Complete Category Support**: Now processes all standard LT categories (GRAMMAR, STYLE, SEMANTICS) instead of filtering them out
- **Improved Rule Mapping**: Added intelligent rule-to-message mapping for better user experience (UPPERCASE_SENTENCE_START, PUNCTUATION_PARAGRAPH_END, etc.)
- **Development Debugging**: Added console logging for LT parity checks to verify results match the LanguageTool website
- **Token Offset Preservation**: New tokenizer preserves exact character positions without trim/normalization for accurate overlap detection
- **Spelling Detection Fix**: Now correctly identifies spelling issues using both TYPOS category and MORFOLOGIK_RULE_* patterns

### Previous Improvements (v3.0) - LanguageTool Only
- **Simplified Architecture**: Removed Hunspell and local dictionaries, now uses LanguageTool API exclusively
- **Enhanced Spell Checking**: Professional spell checking via LanguageTool's MORFOLOGIK_RULE_EN_US and TYPOS categories
- **Improved Performance**: Eliminated local dictionary loading and WASM dependencies
- **Better Suggestions**: Spelling suggestions now come directly from LanguageTool's comprehensive database
- **Streamlined Codebase**: Removed 9 packages and simplified spell checking logic
- **API-First Design**: All spell checking now goes through LanguageTool's public API with proper rate limiting

### Previous Improvements (v2.10)
- **Enhanced Virtual Terminal System**: Comprehensive boundary tracking with proper CWS integration when accepted
- **One-Click Group Cycling**: Revolutionary feature allowing teachers to click virtual terminal dots to cycle both adjacent carets simultaneously
- **Improved Accessibility**: Added keyboard navigation support with Enter/Space key activation for virtual terminal dots
- **Visual Polish**: Enhanced hover effects and focus states for better user experience
- **Golden Test Coverage**: Added comprehensive test for virtual terminal cycling behavior to prevent regressions
- **Figure 4 Compliance**: Enhanced missing terminal detection with proper handling of quotes, parentheses, and TitleCase runs
- **LanguageTool Integration**: Improved mapping of punctuation-related grammar issues to advisory carets

### Previous Improvements (v2.9)
- **Hydration Fixes**: Resolved React hydration error #418 by fixing server-client mismatch issues
- **Date.now() Fix**: Replaced Date.now() in exportCSV with hydration-safe timestamp generation
- **localStorage Hydration**: Fixed localStorage access during component initialization to prevent hydration mismatches
- **Client-Side State Loading**: Added useEffect hooks to load localStorage values after component hydration
- **Improved Stability**: Enhanced application stability and eliminated console errors during initial load

### Previous Improvements (v2.8)
- **Export Functionality**: Added CSV audit export and PDF report generation for comprehensive data analysis
- **Privacy Controls**: Implemented FERPA/COPPA compliant local-only mode with session data clearing
- **Self-hosted LanguageTool**: Support for custom LanguageTool endpoints with privacy toggle and settings UI
- **Rate Limiting**: Added exponential backoff for LanguageTool API rate limits (429 handling)
- **Golden Tests**: Comprehensive Vitest test suite for CWS rule validation and correctness
- **License Compliance**: LanguageTool API usage compliance with prebuild validation
- **Enhanced Privacy**: Default local-only mode ensures no student text leaves browser unless explicitly enabled
- **Session Management**: Clear session data functionality for schools and privacy-conscious users
- **Settings UI**: Intuitive settings popover with gear icon for LanguageTool configuration
- **Privacy Footer**: Clear privacy status indicator with toggle links and session clearing options

### Previous Improvements (v2.7)
- **Virtual Terminal Insertion**: Revolutionary feature that automatically detects and proposes missing sentence-ending punctuation
- **Smart Heuristics**: Advanced detection algorithm that identifies WORD [space] CapitalWord patterns likely to be new sentences
- **Interactive Teacher Control**: Two-caret system allows teachers to accept/reject virtual terminal suggestions
- **Visual Distinction**: Dotted amber styling clearly distinguishes proposed insertions from actual student text
- **CWS Integration**: Virtual terminals integrate seamlessly with CWS scoring when accepted by teachers
- **Advisory by Default**: Virtual suggestions don't affect scores unless explicitly accepted, maintaining assessment integrity
- **Enhanced User Experience**: Clear visual feedback and intuitive interaction model for efficient teacher workflow

### Previous Improvements (v2.6)
- **UI Refactoring**: Complete redesign with cleaner, more professional interface
- **Two-Column Layout**: Left column for text input and controls, right column for metrics and infractions
- **Compact Metrics Grid**: 6 metrics displayed in a responsive 2×3 grid using consistent StatCard components
- **Streamlined Controls**: Removed obsolete dictionary pack toggles, custom lexicon input, and show/hide checkboxes
- **Always-Visible Infractions**: Infractions and suggestions are now always displayed for immediate review
- **Simplified Workflow**: Hardcoded defaults for dictionary packs and custom lexicon eliminate configuration overhead
- **Enhanced Visual Hierarchy**: Better organization with logical grouping of related elements
- **Responsive Design**: Grid layout adapts to different screen sizes for optimal viewing

### Previous Improvements (v2.5)
- **Derived Metrics**: Added CIWS, %CWS, and CWS/min calculations with comprehensive time control
- **Time Control**: Configurable probe duration (mm:ss format) for accurate fluency rate calculations
- **IWS Categorization**: Detailed categorization of Incorrect Writing Sequences by reason (capitalization, spelling, punctuation, pair)
- **Missing Punctuation Detection**: Heuristic advisory system for capitalized words not preceded by terminal punctuation
- **Grammar Mode Badge**: Always-visible indicator showing current grammar checking configuration
- **Enhanced Infractions Panel**: Improved categorization and display of writing sequence issues
- **Smart Heuristics**: Context-aware detection that reduces false positives for proper nouns
- **Interactive Time Input**: User-friendly time input control integrated with existing UI

### Previous Improvements (v2.4)
- **Token Character Offsets**: Added precise character position tracking to Token interface for LanguageTool alignment
- **CWS-LanguageTool Integration**: Created `src/lib/cws-lt.ts` for mapping grammar issues to CWS boundaries
- **3-State Caret Cycling**: Enhanced caret interaction with yellow (advisory) → red (incorrect) → green (correct) → yellow (default)
- **Advisory Hints**: LanguageTool grammar suggestions now appear as yellow carets and advisory infractions
- **Smart Boundary Mapping**: Grammar issues mapped to nearest CWS boundaries within ±2 character window
- **Advisory Infractions**: Grammar suggestions shown as "CWS (advisory)" entries in infractions panel
- **Color Legend**: Added visual guide above token stream explaining caret color meanings for teachers
- **Enhanced User Experience**: Clear cycling instructions and improved tooltips for better teacher usability

### Previous Improvements (v2.3)
- **CWS Engine**: Implemented strictly mechanical, CBM-aligned CWS engine with visual caret indicators
- **Boundary Validation**: Added comprehensive boundary validation with spelling and capitalization checks
- **Visual Feedback**: Color-coded carets show CWS boundary status (green/red/muted)
- **Interactive Overrides**: Click carets to manually override CWS boundary scoring
- **Infraction Integration**: CWS-specific infractions mirror caret reasons for consistent feedback
- **Token Type Alignment**: Unified token types between CWS engine and main application
- **Enhanced Scoring**: CWS count now uses the new engine with proper override handling

### Previous Improvements (v2.2)
- **Smart Engine Tagging**: Added engine-aware dependency tracking that forces all scoring to recompute when LanguageTool loads
- **Enhanced Cache Management**: Engine-tagged spell caching prevents demo results from being reused after LanguageTool loads
- **Automatic Cache Clearing**: Spell cache is automatically cleared when LanguageTool loads to ensure fresh scoring
- **Improved Visual Feedback**: Red badges for misspelled words, green badges for correct words with enhanced styling
- **Stricter Grammar Filtering**: LanguageTool now only shows spelling suggestions for genuine typos
- **Better Override Handling**: Manual overrides are properly respected in both scoring and visual display
- **Enhanced Re-scoring**: All derived values (tokens, WSC, CWS, infractions) are automatically re-computed when spell engine changes
- **Sticky Grammar Client**: LanguageTool client now "sticks" to proxy or public endpoint to avoid repeated failed requests
- **Grammar Status Display**: Grammar badge now shows whether using proxy or public endpoint for better transparency

### Previous Updates
- **Automatic Loading**: LanguageTool now provides spell checking automatically on app startup
- **Automatic Grammar Checking**: Grammar analysis runs automatically as you type with 800ms debounce
- **Request Cancellation**: Added AbortSignal support to prevent stale grammar check results
- **Enhanced Status Display**: Real-time status indicators for both spell and grammar engines
- **Improved UX**: Streamlined workflow with automatic LanguageTool integration
- **Spell Engine Status**: Added visual status indicator showing LanguageTool spell checking mode
- **Auto-validation**: Automatic LanguageTool integration with sanity checks
- **Enhanced Tooltips**: Spelling suggestions now appear in word tooltips when flagged
- **Development Testing**: Added dev probe script for quick LanguageTool validation
- **Curly Apostrophe Support**: Enhanced normalization for smart quotes and apostrophes
- **UI Improvements**: Streamlined interface with automatic background processing
- **Enhanced Capitalization**: Added curly apostrophe handling for consistent CWS capitalization checks
- **Repository Cleanup**: Removed stray files and updated .gitignore for better version control
- **LanguageTool Integration**: Implemented LanguageTool API for professional spell checking
- **API Integration**: Real LanguageTool API support with proper error handling
- **Performance Optimization**: Intelligent caching for spell check results
- **Spell Result Caching**: Intelligent in-memory caching for repeated word lookups
- **Modern TypeScript**: Upgraded to ES2022 target for better performance
- **Bundle Analysis**: Added @next/bundle-analyzer for performance monitoring
- **ESLint Updates**: Aligned with Next.js 15 configuration
- **LanguageTool Grammar**: Advisory grammar checking with smart proxy and fallback
- **Netlify Function Support**: API routes deployed as serverless functions
- **Web Worker Support**: Non-blocking spell checking for large dictionaries

## References

Aligned to research standards from:
- Wright, 1992
- McMaster & Espin, 2007  
- Wright, 2013
CBM Web Tool
