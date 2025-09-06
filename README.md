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
- **LanguageTool Grammar**: Optional grammar checking and suggestions
- **Infraction Flagging**: Automated detection of definite vs. possible issues
- **Interactive Overrides**: Click words to toggle WSC scoring, click carets to toggle CWS pairs
- **Rule-based Checks**: Capitalization, terminal punctuation, and sentence structure validation

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
- **Spelling Suggestions**: Built-in Hunspell suggestion engine for misspelled words
- **Seamless Fallback**: Uses custom lexicon with light stemming when Hunspell not loaded
- **Performance Optimized**: Aggressive caching (1-year) for dictionary files
- **Web Worker Ready**: Architecture supports moving to Web Worker for large dictionaries

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

## Extensibility

The tool is designed for easy extension:
- **Real Hunspell WASM**: Professional spell checking with 500K+ word support
- **LanguageTool Grammar**: Grammar checking already integrated
- **Multi-language Ready**: Add support for additional languages with new dictionary files
- **Advanced Grammar**: Add POS-based rules for enhanced grammar checking
- **Dictionary Integration**: Easy integration with additional dictionary databases
- **Web Worker Support**: Non-blocking spell checking for performance optimization

## References

Aligned to research standards from:
- Wright, 1992
- McMaster & Espin, 2007  
- Wright, 2013
CBM Web Tool
