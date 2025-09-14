# Written Expression (TWW, WSC, CWS) – with Flags

A TypeScript React web application for Curriculum‑Based Measurement (CBM) written expression scoring.

## Kiosk — Timed Writing

 A focused, student-facing timed writing interface is available at `/kiosk`.

 - Clean two-step flow: setup, then writing only
   - Step 1 (Setup): Enter optional student name and select duration (minutes), choose options, then press Continue.
   - Step 2 (Writing): Only the text field is shown. The timer starts automatically on the first character typed. No word or character counters, and no stop‑early control to avoid distractions.
 - Session end: When time elapses, the page beeps and switches to a completion view where the text can be copied or downloaded as `.txt`, or a new session can be started.
 - Navigation: The top nav is hidden during the writing step to keep the student focused.

 Options on setup
 - Prevent paste during writing: Blocks paste events while the timer is running.
 - Show timer in writing view: Displays a subtle countdown in the top‑right during writing.

## Breaking Changes (v9.0)

- Removed terminal groups (^ . ^) and any group toggling UI.
 - Missing punctuation is flagged directly on the caret between words; carets are individually clickable to override boundary status.
- Added left-side Discard area: drag words or individual carets to remove them from the stream and KPIs; Undo via button or Cmd/Ctrl+Z.
- KPIs now compute CWS using word states plus caret flags (no group acceptance needed).
- Output text now shows GrammarBot's full corrected text when available (the `correction` field). If `correction` is missing, it reconstructs the text by applying GrammarBot's edits. Discarded tokens do not affect this pane.

## Features

### Written Expression Scoring
- **TWW (Total Words Written)**: Counts all words written, including misspellings, excluding numerals
- **WSC (Words Spelled Correctly)**: Uses GrammarBot API for professional spell checking
- **CWS (Correct Writing Sequences)**: Mechanical, CBM-aligned scoring of adjacent unit pairs with visual caret indicators

<!-- Spelling assessment (CLS) removed; app now focuses on Written Expression only -->

### Navigation & Pages
- Top navigation includes:
  - `Scoring` — Main written expression scoring tool (home page)
  - `Kiosk` — Student-facing timed writing interface

### Data Persistence (Neon on Netlify)
- Environment: Set `NEON_DATABASE_URL` (or `DATABASE_URL`) in Netlify to your Neon connection string.
- API endpoints:
  - `POST /api/submissions` — Save a submission. Body: `{ student?: string, text: string, durationSeconds?: number, startedAt?: string }`. Returns `{ id }`.
  - `GET /api/submissions` — List recent submissions.
  - `GET /api/submissions/:id` — Get a specific submission including full `content`.
- Schema: Created on first use as table `submissions (id text primary key, student_name text, content text, duration_seconds int, started_at timestamptz, submitted_at timestamptz default now())`.
- Kiosk auto‑saves when time expires and shows an “Open in Scoring” shortcut.


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
- **GrammarBot API**: Professional spell checking and grammar analysis via GrammarBot's neural API
- **GrammarBot Integration**: Professional spell checking and grammar checking via GrammarBot API
- **Spell Engine Status**: Visual indicator showing GrammarBot spell checking mode
- **Spelling Suggestions**: Tooltip suggestions for misspelled words via GrammarBot
- **GrammarBot Grammar**: Automatic grammar checking with debounced text analysis
- **Request Cancellation**: AbortSignal support for grammar checking requests
- **Rate Limiting**: Simple backoff handling for GrammarBot 429 responses
- **Infraction Flagging**: Automated detection of definite vs. possible issues from GrammarBot
- **Aggregated Infractions List**: Groups identical GrammarBot infractions by type + replacement and shows a frequency count (e.g., `10× PUNC → .`), sorted by most frequent
- **Output Text (Corrected)**: Blue box shows GrammarBot's full corrected text; falls back to locally applying GB edits if needed
- **Rule Tooltips**: Instant, accessible tooltips show rule labels and suggested replacements on hover for tokens; terminal dots/carets show proposed punctuation. Includes a subtle pop‑in animation.
- **Interactive Overrides**: Click words to toggle WSC scoring; clicking a word also synchronizes the two adjacent carets to match the word's new state. Click carets to cycle their state individually.
- **CWS Engine**: Strictly mechanical, CBM-aligned engine with visual caret indicators and boundary validation
- **Rule-based Checks**: Capitalization, terminal punctuation, and sentence structure validation
- **Spell Result Caching**: Intelligent caching for GrammarBot API responses
- **Curly Apostrophe Support**: Proper handling of smart quotes and apostrophes
- **Token Character Offsets**: Precise character position tracking for GrammarBot issue alignment
- **Discard Controls**: Drag words or individual carets into the Discard panel to hide them from the stream and make them non‑blocking for CWS; Undo restores the last removal (Cmd/Ctrl+Z).

### Layout & Responsiveness
- **Wide Container on Large Screens**: Main wrapper uses `max-w-screen-xl 2xl:max-w-screen-2xl` so the app fills more of a 1080p/1440p display while staying fluid on smaller screens.
- **Discard-Aware Padding (Calculated)**: At `xl` and up, the body reserves exactly the space needed for the left Discard area using CSS variables and a utility class:
  - Variables in `src/app/globals.css`:
    - `--discard-x`: distance from window edge to discard area (gap)
    - `--discard-w`: width of the discard area
  - Padding applied via `.with-discard-pad` only at `xl+`: `padding-left = (2 × gap) + width`, creating equal spacing on both sides of the discard and preventing overlap.
- **Tuning**: Adjust `--discard-x` and `--discard-w` in `globals.css` to change the discard size/offset, or override them inside media queries for per‑breakpoint sizing.
- **CWS-GrammarBot Integration**: Grammar suggestions mapped to CWS boundaries with advisory hints
- **3-State Caret Cycling**: Yellow (advisory) → Red (incorrect) → Green (correct) → Yellow (default)
- **Advisory Infractions**: GrammarBot grammar suggestions shown as yellow advisory entries
- **Color Legend**: Visual guide for teachers explaining caret color meanings
- **Derived Metrics**: CIWS, %CWS, and CWS/min calculations with time control
- **Time Control**: Configurable probe duration (mm:ss format) for fluency rate calculations
- **IWS Categorization**: Detailed categorization of Incorrect Writing Sequences by reason
- **Virtual Terminal Insertion**: Smart detection and insertion of missing sentence-ending punctuation with interactive teacher controls
- **One-Click Group Cycling**: Click virtual terminal dots to cycle both adjacent carets in lock-step (yellow→red→green→yellow)
- **Enhanced Virtual Terminal System**: Comprehensive boundary tracking with proper CWS integration when accepted
- **Grammar Mode Badge**: Always-visible indicator showing current grammar checking configuration
- **Export Functionality**: CSV audit export and PDF report generation
- **Privacy Controls**: FERPA/COPPA compliant with secure API key handling
- **Rate Limiting**: Automatic backoff for GrammarBot API rate limits
- **Golden Tests**: Comprehensive test suite for CWS rule validation
- **License Compliance**: GrammarBot API usage compliance
- **GB Token Annotation**: Visual token highlighting with color-coded pills (green=correct, yellow=possible, red=incorrect)
- **Caret Row Display**: Visual caret indicators showing GB-proposed terminal punctuation positions
- **Capitalization Overlays**: Optional display of capitalization fixes without changing source text
- **Terminal Dots**: Visual indicators for punctuation insertions from GB analysis
- **Enhanced Infractions**: GB-only infractions panel with proper GRMR/SPELL/PUNC tagging

## Recent Improvements

### Terminal Group System Overhaul (v8.1)
- **Single Clickable Units**: Terminal groups (^ . ^) are now single buttons that toggle the entire group together
<!-- Legacy: terminal groups/dots were non-interactive. Current UI uses individually clickable caret buttons. -->
- **Unified State Management**: Single click handler cycles entire terminal groups while maintaining individual token control
- **Deduplication Logic**: New `buildTerminalGroups` function eliminates duplicate "^ . ^ . ^" triples at paragraph breaks
- **Boundary-Based Grouping**: Groups are deduplicated by boundary index to prevent overlapping suggestions
- **Source Tracking**: Terminal groups track their source ('GB' for GrammarBot, 'PARA' for paragraph fallback)
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

2. Set up GrammarBot API key:
   - Get your API key from [https://neural.grammarbot.io/](https://neural.grammarbot.io/)
   - Create a `.env.local` file in the project root
   - Add your API key: `GRAMMARBOT_API_KEY=your_api_key_here`
   - Restart the dev server after adding the key
   - If the key is missing or invalid, the app shows a small banner indicating GrammarBot is unavailable

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Development Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production (includes license compliance check)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run tests with Vitest UI
- `npm run test:run` - Run tests in command line mode
- `npm run size:report` - Analyze dependency sizes (shows top 30 largest packages)
- `npm run analyze` - Generate bundle analysis reports (requires ANALYZE=1)

## Usage
1. Paste student writing in the text area
2. Set the probe time duration (mm:ss format) for fluency calculations
3. GrammarBot provides professional spell checking and grammar analysis via API
4. Grammar checking runs automatically as you type (debounced)
5. Review the 6 key metrics in the right column grid
6. Review the aggregated infractions and suggestions (always visible) — driven purely by GrammarBot, grouped by type + replacement with counts, and ordered from most to fewest
7. Use interactive overrides to adjust scoring as needed (click words for WSC; clicking a word also synchronizes the two adjacent carets to match the word; click carets to cycle CWS)
8. Drag words or individual carets into the Discard panel to remove them from the stream and KPIs; use Undo to restore
9. Capitalization issues are treated as errors (red) but the original word casing is preserved in the bubble
10. The blue Output Text box shows GrammarBot's full corrected text for quick review

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
- No local heuristics at runtime: spelling/capitalization highlighting is based solely on GrammarBot edits. A banner appears if GrammarBot is unavailable.

### Punctuation Handling

- Missing terminal punctuation is indicated by caret flags at boundaries. Carets are clickable and keyboard-accessible for overrides.
- Commas and non‑sentence punctuation do not affect CWS.
- Paragraphs without terminal punctuation are still considered; end-of-text carets can be flagged.

### Capitalization Treatment

- Capitalization fixes returned by GrammarBot (pure case‑change replacements) are treated as errors (red) but do not change the bubble text (original casing is shown).
- Caret highlighting derives from adjacent token states; both carets around an error reflect the token’s severity.

## Scoring Guidelines

- **TWW**: All words written; include misspellings; exclude numerals
- **WSC**: Words spelled correctly in isolation (GrammarBot + custom lexicon)
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
  - Yellow: Advisory hint from GrammarBot grammar checking
  - Muted: Non-eligible boundary (comma/quote/etc.)
- **Interactive Overrides**: Click carets to cycle through yellow (advisory)→red (incorrect)→green (correct)→yellow (default)
- **Character Position Tracking**: Token offsets enable precise alignment of GrammarBot issues to CWS boundaries

## Spell Checking & Grammar

### GrammarBot Integration
- **API-based Spell Checking**: Uses GrammarBot's neural API for professional spell checking
- **Enhanced Spelling Detection**: Neural network-based detection for typos and grammar issues
- **Language Variant Support**: Uses `en-US` variant for optimal spelling and grammar detection
- **Complete Category Support**: Processes all standard grammar categories (spelling, grammar, style, punctuation)
- **Intelligent Rule Mapping**: Maps grammar issues to user-friendly messages
- **Development Debugging**: Console logging for GrammarBot parity checks
- **Automatic Grammar Checking**: Grammar analysis runs automatically as you type with debounce
- **Status Tracking**: Visual badge shows GrammarBot spell checking mode
- **Spelling Suggestions**: Built-in GrammarBot suggestion engine for misspelled words
- **Tooltip Integration**: Suggestions appear in word tooltips when words are flagged
- **Spell Result Caching**: Intelligent in-memory caching for GrammarBot API responses
- **Rate Limiting**: Simple backoff handling for 429 responses with 1.5s retry delay
- **Request Cancellation**: AbortSignal support for canceling stale requests
- **Correction Preview**: Shows GrammarBot's suggested correction for sanity checking
- **Capitalization Toggle**: Option to show/hide capitalization fixes in infractions

### GrammarBot Grammar
- **Automatic Grammar Checking**: Runs automatically as you type with 800ms debounce
- **Request Cancellation**: AbortSignal support prevents stale grammar check results
- **Server Proxy**: Uses Next.js API route to keep API key secure
- **Advisory-only suggestions** (doesn't affect CBM scores)
- **Status Indicators**: Visual feedback showing grammar check status (idle/checking/ok/error)
- **CWS Boundary Mapping**: Grammar issues mapped to nearest CWS boundaries
- **Advisory Hints**: Grammar suggestions shown as yellow carets and advisory infractions
- **Smart Filtering**: Only grammar issues (not spelling/punctuation) mapped to boundaries
- **Grammar Mode Badge**: Always-visible indicator showing current grammar configuration
- **Debug Parity Assert**: Verifies that applying all GrammarBot edits reproduces the correction

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
- **Enhanced Infractions**: GB-only infractions panel with proper GRMR/SPELL/PUNC tagging and aggregated counts
- **Interactive Tooltips**: Hover over tokens to see rule labels and suggestions (e.g., Capitalization, Grammar → were, Spelling → friend). Instant display with a subtle pop‑in animation.
- **Debug Logging**: Console output for development debugging with `__CBM_DEBUG__` flag

### GB Insertion Display System
- **Insertion Pills**: Blue pills show suggested punctuation insertions from GrammarBot:
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
- **Scope**: Display is derived directly from `gb.edits` (no heuristics), ensuring parity with GrammarBot output while staying compact.

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

### LanguageTool Grammar
- **Automatic Grammar Checking**: Runs automatically as you type with 800ms debounce
- **Request Cancellation**: AbortSignal support prevents stale grammar check results
- **Smart Proxy with Fallback**: Uses local API proxy with automatic fallback to public service
- **Netlify Function Support**: API routes deployed as Netlify Functions for optimal performance
- **Advisory-only suggestions** (doesn't affect CBM scores)
- **Status Indicators**: Visual feedback showing grammar check status (idle/checking/ok/error)
- **CWS Boundary Mapping**: Grammar issues mapped to nearest CWS boundaries within ±2 characters
- **Advisory Hints**: Grammar suggestions shown as yellow carets and advisory infractions
- **Smart Filtering**: Only grammar issues (not spelling/punctuation) mapped to boundaries
- **Grammar Mode Badge**: Always-visible indicator showing current grammar configuration (public/proxy/off)

### Virtual Terminal Insertion (LT-Only Architecture)
- **Pure LT Architecture**: Completely redesigned to use only LanguageTool for terminal punctuation suggestions
- **Eliminated Heuristics**: Removed all heuristic-based logic including paragraph-end detection, capitalization rules, and smart comma detection
- **Minimal Rule Set**: Only processes three specific LT rules: `UPPERCASE_SENTENCE_START`, `MISSING_SENTENCE_TERMINATOR`, and `PUNCTUATION_PARAGRAPH_END`
- **Robust Field Shims**: Tolerant field accessors handle different LanguageTool server response formats
- **Caret-Aware Logic**: Advanced boundary detection that places terminals using caret ("^") ownership for proper VT integration
- **Simple Tokenizer**: Clean tokenization that yields WORD/PUNCT/BOUNDARY tokens including caret markers
- **Streamlined Pipeline**: LT issues → filter → convert to insertions → display, with no complex fusion layers
- **Proven Functionality**: Comprehensive test suite validates the LT-only pipeline works independently
- **Clean Codebase**: Removed 1000+ lines of complex heuristic logic and wrapper functions
- **Better Maintainability**: Single source of truth for terminal insertions (LanguageTool only)
- **Reduced Complexity**: Simplified UI and logic focused solely on LT results

### Terminal Group System
- **LT-Driven Grouping**: LanguageTool punctuation/grammar issues automatically grouped with three related carets
- **Three-Caret Structure**: Each group contains groupLeftCaret, primaryCaret, and groupRightCaret
- **Smart Boundary Detection**: Uses LT match offset/length to find primary caret, then expands to sentence boundaries
- **Bulk Toggle Operations**: One-click cycling of all three carets simultaneously (yellow → red → green → yellow)
- **Visual Group Highlighting**: Hovering over terminal suggestions highlights all related carets with blue rings
- **Independent Groups**: Each terminal group operates independently without cross-coupling
- **Edge Case Handling**: Properly handles start-of-text and end-of-text boundaries
- **Suggestion Panel Integration**: Terminal groups appear as blue-themed suggestions in the infractions panel
- **Hover Preview**: Users can see which carets will be affected before clicking
- **Smooth Transitions**: All visual changes use CSS transitions for polished user experience

## Deployment

### Netlify Deployment (Recommended)

The application is configured for optimal Netlify deployment:

1. **Automatic Build**: Netlify will run `npm run build` automatically
2. **API Functions**: GrammarBot proxy routes are deployed as Netlify Functions
3. **Environment Variables**: Set `GRAMMARBOT_API_KEY` in Netlify environment variables
4. **Configuration**: Uses `netlify.toml` with Next.js plugin for proper function deployment

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

### FERPA/COPPA Compliance
- **API Key Required**: GrammarBot requires an API key for cloud-based grammar checking
- **Secure Proxy**: API key is kept secure on the server side, never exposed to the browser
- **No Data Collection**: Student text is only sent to GrammarBot for grammar checking
- **Session Data Clearing**: One-click session data clearing for privacy-conscious environments
- **Transparent Privacy**: Clear indicators show when cloud services are enabled
- **Educational Focus**: Designed specifically for school environments with privacy requirements

### Privacy Controls
- **Secure API Key**: API key is stored securely on the server side
- **Rate Limiting**: Automatic handling of API rate limits with exponential backoff
- **Clear Session Data**: Complete reset of all settings and student text

### License Compliance
- **GrammarBot Attribution**: Proper attribution for GrammarBot API usage
- **API Usage**: Compliant with GrammarBot's terms of service
- **Privacy Controls**: FERPA/COPPA compliant with secure API key handling

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
- **GrammarBot API**: Professional spell checking and grammar analysis with neural network support
- **Multi-language Ready**: GrammarBot supports multiple languages with neural processing
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
- **GB Insertion Pills**: New blue pill system displays suggested punctuation insertions from GrammarBot
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
- **Enhanced Infractions**: GB-only infractions panel with proper GRMR/SPELL/PUNC tagging
- **Interactive Tooltips**: Hover over tokens to see error categories and suggestions
- **Debug Logging**: Console output for development debugging with `__CBM_DEBUG__` flag
- **New Annotation Module**: Created `src/lib/gbAnnotate.ts` with `annotateFromGb` and `buildCaretRow` functions
- **CSS Styling**: Added comprehensive styles for caret states and token pill colors
- **UI Integration**: Seamless integration with existing token display and infractions panel

### Previous Improvements (v6.1) - GrammarBot Migration Polish
- **Complete Migration**: Fully migrated from LanguageTool to GrammarBot for all grammar and spell checking
- **Neural Network Processing**: Now uses GrammarBot's neural API for enhanced accuracy
- **Secure API Proxy**: Server-side API key handling keeps credentials secure
- **Simplified Architecture**: Removed all LanguageTool code, rule filters, and LT→VT paths
- **Enhanced Performance**: Streamlined grammar checking with neural network processing
- **Updated UI**: All labels now show "GB-only" and "GrammarBot" instead of LT references
- **Pure GB Infractions**: Infractions list now renders directly from gb.edits with proper mapping
- **Rate Limiting**: Added simple backoff handling for GrammarBot 429 responses
- **Correction Preview**: Added GrammarBot correction preview banner for sanity checking
- **Capitalization Toggle**: Added toggle to show/hide capitalization fixes in infractions
- **Debug Parity Assert**: Added assertion that GB edits reproduce response.correction
- **API Key Security**: Confirmed GRAMMARBOT_API_KEY is server-only and never logged
- **Maintained Compatibility**: All existing features work seamlessly with GrammarBot

### Previous Improvements (v6.0) - GrammarBot Integration
- **Initial Migration**: Migrated from LanguageTool to GrammarBot for all grammar and spell checking
- **Neural Network Processing**: Now uses GrammarBot's neural API for enhanced accuracy
- **Secure API Proxy**: Server-side API key handling keeps credentials secure
- **Simplified Architecture**: Removed complex LanguageTool configuration and settings
- **Enhanced Performance**: Streamlined grammar checking with neural network processing
- **Updated UI**: All labels and indicators now reflect GrammarBot integration
- **API Key Setup**: Simple environment variable configuration for GrammarBot API key
- **Maintained Compatibility**: All existing features work seamlessly with GrammarBot

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
