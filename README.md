# CBM Writing & Spelling Tool

A comprehensive TypeScript React web application for Curriculum-Based Measurement (CBM) writing and spelling assessment.

## Features

### Written Expression Scoring
- **TWW (Total Words Written)**: Counts all words written, including misspellings, excluding numerals
- **WSC (Words Spelled Correctly)**: Uses dictionary packs and custom lexicon for spell-checking
- **CWS (Correct Writing Sequences)**: Scores adjacent unit pairs across words and essential punctuation

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
- **Interactive Overrides**: Click words to toggle WSC scoring, click carets to toggle CWS pairs
- **Rule-based Checks**: Capitalization, terminal punctuation, and sentence structure validation
- **Spell Result Caching**: Intelligent caching for repeated word lookups (big speedup on longer texts)
- **Curly Apostrophe Support**: Proper handling of smart quotes and apostrophes

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
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run size:report` - Analyze dependency sizes (shows top 30 largest packages)
- `npm run analyze` - Generate bundle analysis reports (requires ANALYZE=1)

## Usage

### Written Expression Tab
1. Paste student writing in the text area
2. Select appropriate dictionary packs for the student's grade level
3. Add custom words to the lexicon if needed
4. Hunspell loads automatically on startup for professional spell checking
5. Grammar checking runs automatically as you type (debounced)
6. Review automated scoring and infraction flags
7. Use interactive overrides to adjust scoring as needed

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

## Extensibility

The tool is designed for easy extension:
- **Real Hunspell WASM**: Professional spell checking with 500K+ word support
- **LanguageTool Grammar**: Grammar checking already integrated
- **Multi-language Ready**: Add support for additional languages with new dictionary files
- **Advanced Grammar**: Add POS-based rules for enhanced grammar checking
- **Dictionary Integration**: Easy integration with additional dictionary databases
- **Web Worker Support**: Non-blocking spell checking for performance optimization

## Recent Updates

### Latest Improvements (v2.1)
- **Enhanced Cache Management**: Engine-aware spell caching prevents demo results from being reused after Hunspell loads
- **Automatic Cache Clearing**: Spell cache is automatically cleared when Hunspell loads to ensure fresh scoring
- **Improved Visual Feedback**: Red badges for misspelled words, green badges for correct words with enhanced styling
- **Stricter Grammar Filtering**: LanguageTool now only shows spelling suggestions for genuine typos, not style preferences
- **Better Override Handling**: Manual overrides are properly respected in both scoring and visual display
- **Enhanced Re-scoring**: All derived values (tokens, WSC, CWS, infractions) are automatically re-computed when spell engine changes

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
