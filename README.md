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
- **Spell Engine Status**: Visual indicator showing active spell engine (Demo/Hunspell)
- **Auto-validation**: Automatic probe testing after Hunspell loading
- **Spelling Suggestions**: Tooltip suggestions for misspelled words when Hunspell is active
- **LanguageTool Grammar**: Optional grammar checking and suggestions
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
4. (Optional) Click "Load Hunspell" for professional spell checking
5. (Optional) Click "Grammar check" for LanguageTool suggestions
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
- **Dynamic Loading**: Click "Load Hunspell" to enable advanced spell checking with 500K+ words
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
- Optional grammar checking and suggestions
- Uses proxy API route to avoid rate limits
- Advisory-only suggestions (doesn't affect CBM scores)
- Click "Grammar check" to analyze text

## Deployment

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

- **Spell Engine Status**: Added visual status indicator showing active spell engine (Demo/Hunspell)
- **Auto-validation**: Automatic probe testing after Hunspell loading with sanity checks
- **Enhanced Tooltips**: Spelling suggestions now appear in word tooltips when flagged
- **Smart Button States**: Load Hunspell button disables after successful loading
- **Development Testing**: Added dev probe script for quick Hunspell validation
- **Curly Apostrophe Support**: Enhanced normalization for smart quotes and apostrophes
- **UI Improvements**: Removed duplicate "Reset overrides" button for cleaner interface
- **Enhanced Capitalization**: Added curly apostrophe handling for consistent CWS capitalization checks
- **Repository Cleanup**: Removed stray files and updated .gitignore for better version control
- **Real Hunspell WASM**: Implemented `hunspell-asm` library for professional spell checking
- **Dictionary Integration**: Real `en_US.aff` and `en_US.dic` file support with UTF-8 encoding
- **Performance Optimization**: Aggressive caching (1-year) for dictionary files
- **Spell Result Caching**: Intelligent in-memory caching for repeated word lookups
- **Modern TypeScript**: Upgraded to ES2022 target for better performance
- **Bundle Analysis**: Added @next/bundle-analyzer for performance monitoring
- **ESLint Updates**: Aligned with Next.js 15 configuration
- **LanguageTool Grammar**: Advisory grammar checking with API proxy
- **Web Worker Support**: Non-blocking spell checking for large dictionaries

## References

Aligned to research standards from:
- Wright, 1992
- McMaster & Espin, 2007  
- Wright, 2013
CBM Web Tool
