# CBM Writing & Spelling Tool

A comprehensive TypeScript React web application for Curriculum-Based Measurement (CBM) writing and spelling assessment.

## Features

### Written Expression Scoring
- **TWW (Total Words Written)**: Counts all words written, including misspellings, excluding numerals
- **WSC (Words Spelled Correctly)**: Uses dictionary packs and custom lexicon for spell-checking
- **CWS (Correct Writing Sequences)**: Mechanical, CBM-aligned scoring of adjacent unit pairs with visual caret indicators

### Spelling Assessment
- **CLS (Correct Letter Sequences)**: Provides partial credit for spelling attempts
- Per-word breakdown and totals
- Aligned target and attempt word lists

### Advanced Features
- **Dictionary Packs**: Demo bundles for different grade levels (K-2, K-5, general)
- **Custom Lexicon**: Add custom words for specialized vocabulary
- **Hunspell Integration**: Professional spell checking with WASM dictionaries
- **Automatic Loading**: Hunspell loads automatically on app startup
- **Spell Engine Status**: Visual indicator showing active spell engine (Demo/Hunspell)
- **Auto-validation**: Automatic probe testing after Hunspell loading
- **Spelling Suggestions**: Tooltip suggestions for misspelled words when Hunspell is active
- **LanguageTool Grammar**: Automatic grammar checking with debounced text analysis
- **Request Cancellation**: AbortSignal support for grammar checking requests
- **Infraction Flagging**: Automated detection of definite vs. possible issues
- **Interactive Overrides**: Click words to toggle WSC scoring, click carets to cycle CWS states
- **CWS Engine**: Strictly mechanical, CBM-aligned engine with visual caret indicators and boundary validation
- **Rule-based Checks**: Capitalization, terminal punctuation, and sentence structure validation
- **Spell Result Caching**: Intelligent caching for repeated word lookups (big speedup on longer texts)
- **Curly Apostrophe Support**: Proper handling of smart quotes and apostrophes
- **Token Character Offsets**: Precise character position tracking for LanguageTool issue alignment
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
- **Privacy Controls**: FERPA/COPPA compliant local-only mode with session data clearing
- **Self-hosted LanguageTool**: Support for custom LanguageTool endpoints with privacy toggle
- **Rate Limiting**: Exponential backoff for LanguageTool API rate limits
- **Golden Tests**: Comprehensive test suite for CWS rule validation
- **License Compliance**: Automatic license checking for SCOWL/Hunspell dictionaries

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

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

### Written Expression Tab
1. Paste student writing in the text area
2. Set the probe time duration (mm:ss format) for fluency calculations
3. Hunspell loads automatically on startup for professional spell checking
4. Grammar checking runs automatically as you type (debounced)
5. Review the 6 key metrics in the right column grid
6. Check infractions and suggestions (always visible)
7. Use interactive overrides to adjust scoring as needed (click words for WSC, click carets for CWS)

### Spelling Tab
1. Enter target words (comma/semicolon/newline separated)
2. Enter student attempts in the same order
3. Review CLS scores and word-by-word breakdown

## Technical Implementation

- Built with Next.js 15, React 18, and TypeScript
- Uses Framer Motion for animations
- Tailwind CSS for styling
- Lucide React for icons
- Modular UI components with shadcn/ui design system
- Optimized for production with standalone output and minimal runtime bundles
- Modern TypeScript configuration (ES2022 target) for better performance
- ESLint configuration aligned with Next.js 15
- Bundle analyzer integration for performance monitoring

## Scoring Guidelines

- **TWW**: All words written; include misspellings; exclude numerals
- **WSC**: Words spelled correctly in isolation (dictionary packs + custom lexicon)
- **CWS**: Adjacent units (words & essential punctuation). Commas excluded. Initial valid word counts 1. Capitalize after terminals
- **CLS**: Counts boundary + adjacent letter pairs per target word (partial knowledge credit)

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

### Hunspell Integration
- **Real WASM Implementation**: Uses `hunspell-asm` library for professional spell checking
- **Dictionary Files**: Uses `en_US.aff` and `en_US.dic` files from LibreOffice dictionaries
- **Automatic Loading**: Hunspell loads automatically on app startup for seamless experience
- **Status Tracking**: Visual badge shows active spell engine (Demo lexicon vs Hunspell WASM)
- **Auto-validation**: Automatic probe testing with common words after loading
- **Spelling Suggestions**: Built-in Hunspell suggestion engine for misspelled words
- **Tooltip Integration**: Suggestions appear in word tooltips when words are flagged
- **Seamless Fallback**: Uses custom lexicon with light stemming when Hunspell not loaded
- **Performance Optimized**: Aggressive caching (1-year) for dictionary files
- **Spell Result Caching**: Intelligent in-memory caching for repeated word lookups
- **Web Worker Ready**: Architecture supports moving to Web Worker for large dictionaries
- **Development Testing**: Automatic probe in dev mode for quick validation

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

### Virtual Terminal Insertion
- **Smart Detection**: Automatically detects WORD [space] CapitalWord patterns that look like new sentences
- **Heuristic Filtering**: Uses contextual clues (newlines, 2+ spaces, sentence starters) to reduce false positives
- **Title Case Avoidance**: Excludes TitleCase spans like "The Terrible Day" to prevent over-flagging
- **Visual Insertion**: Inserts dotted "." tokens between words with distinct amber styling
- **Two Caret System**: Creates two yellow advisory carets around each virtual terminal (word ^ . and . ^ NextWord)
- **Interactive Control**: Teachers can click carets to cycle: yellow (advisory) → red (reject) → green (accept)
- **One-Click Group Cycling**: Click virtual terminal dots to cycle both adjacent carets simultaneously in lock-step
- **CWS Integration**: When accepted (green), virtual terminals count as essential punctuation creating two CWS boundaries
- **Advisory by Default**: Virtual terminals don't affect CWS scores unless explicitly accepted by teacher
- **Clear Visual Feedback**: Dashed amber borders, hover effects, and tooltips clearly indicate proposed insertions
- **Accessibility**: Keyboard navigation support with Enter/Space key activation for virtual terminal dots
- **Comprehensive Boundary Tracking**: Each virtual terminal tracks its dot token index and associated CWS boundary indices

## Deployment

### Netlify Deployment (Recommended)

The application is configured for optimal Netlify deployment:

1. **Automatic Build**: Netlify will run `npm run build` automatically
2. **API Functions**: LanguageTool proxy routes are deployed as Netlify Functions
3. **Smart Fallback**: Grammar checking automatically falls back to public API if functions aren't available
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
- **Default Local-Only Mode**: Grammar checking is disabled by default to protect student privacy
- **No Data Collection**: Student text never leaves the browser unless explicitly enabled
- **Session Data Clearing**: One-click session data clearing for privacy-conscious environments
- **Transparent Privacy**: Clear indicators show when cloud services are enabled
- **Educational Focus**: Designed specifically for school environments with privacy requirements

### Privacy Controls
- **Privacy Toggle**: Easy enable/disable of cloud grammar checking
- **Settings UI**: Intuitive configuration with gear icon settings popover
- **Self-hosted Support**: Use your own LanguageTool instance for complete control
- **Rate Limiting**: Automatic handling of API rate limits with exponential backoff
- **Clear Session Data**: Complete reset of all settings and student text

### License Compliance
- **SCOWL Attribution**: Proper attribution for dictionary word lists (LGPL/MPL)
- **Hunspell Attribution**: Proper attribution for spell checking engine (GPL/LGPL/MPL)
- **Automatic Validation**: License compliance check runs before every build
- **Dictionary Files**: Includes proper license documentation in `public/dicts/LICENSES.md`

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
- **Real Hunspell WASM**: Professional spell checking with 500K+ word support
- **LanguageTool Grammar**: Grammar checking already integrated
- **Multi-language Ready**: Add support for additional languages with new dictionary files
- **Advanced Grammar**: Add POS-based rules for enhanced grammar checking
- **Dictionary Integration**: Easy integration with additional dictionary databases
- **Web Worker Support**: Non-blocking spell checking for performance optimization
- **Export Extensions**: Easy to add new export formats (JSON, XML, etc.)
- **Privacy Extensions**: Framework for additional privacy controls and compliance features

## Recent Updates

### Latest Improvements (v2.10)
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
- **License Compliance**: Automatic license checking for SCOWL/Hunspell dictionaries with prebuild validation
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
- **Smart Engine Tagging**: Added engine-aware dependency tracking that forces all scoring to recompute when Hunspell loads
- **Enhanced Cache Management**: Engine-tagged spell caching prevents demo results from being reused after Hunspell loads
- **Automatic Cache Clearing**: Spell cache is automatically cleared when Hunspell loads to ensure fresh scoring
- **Improved Visual Feedback**: Red badges for misspelled words, green badges for correct words with enhanced styling
- **Stricter Grammar Filtering**: LanguageTool now only shows spelling suggestions for genuine typos, filtered by Hunspell when available
- **Better Override Handling**: Manual overrides are properly respected in both scoring and visual display
- **Enhanced Re-scoring**: All derived values (tokens, WSC, CWS, infractions) are automatically re-computed when spell engine changes
- **Sticky Grammar Client**: LanguageTool client now "sticks" to proxy or public endpoint to avoid repeated failed requests
- **Grammar Status Display**: Grammar badge now shows whether using proxy or public endpoint for better transparency

### Previous Updates
- **Automatic Loading**: Hunspell now loads automatically on app startup for seamless experience
- **Automatic Grammar Checking**: Grammar analysis runs automatically as you type with 800ms debounce
- **Request Cancellation**: Added AbortSignal support to prevent stale grammar check results
- **Enhanced Status Display**: Real-time status indicators for both spell and grammar engines
- **Improved UX**: Removed manual "Load Hunspell" and "Grammar check" buttons for streamlined workflow
- **Spell Engine Status**: Added visual status indicator showing active spell engine (Demo/Hunspell)
- **Auto-validation**: Automatic probe testing after Hunspell loading with sanity checks
- **Enhanced Tooltips**: Spelling suggestions now appear in word tooltips when flagged
- **Development Testing**: Added dev probe script for quick Hunspell validation
- **Curly Apostrophe Support**: Enhanced normalization for smart quotes and apostrophes
- **UI Improvements**: Streamlined interface with automatic background processing
- **Enhanced Capitalization**: Added curly apostrophe handling for consistent CWS capitalization checks
- **Repository Cleanup**: Removed stray files and updated .gitignore for better version control
- **Real Hunspell WASM**: Implemented `hunspell-asm` library for professional spell checking
- **Dictionary Integration**: Real `en_US.aff` and `en_US.dic` file support with UTF-8 encoding
- **Performance Optimization**: Aggressive caching (1-year) for dictionary files
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
