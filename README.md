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
- Professional spell checking using custom dictionary parser
- Uses `en_US.aff` and `en_US.dic` files from LibreOffice dictionaries
- Click "Load Hunspell" to enable advanced spell checking with 500K+ words
- Implements edit distance algorithm for spelling suggestions
- Seamlessly falls back to custom lexicon when not loaded

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
- **Dependency Analysis**: Use `npm run size:report` to identify large packages

## Extensibility

The tool is designed for easy extension:
- Custom dictionary parser with 500K+ word support
- LanguageTool grammar checking already integrated
- Add POS-based rules for advanced grammar checking
- Integrate with additional dictionary databases
- Add support for additional languages
- WASM-based spell checking can be added for advanced features

## References

Aligned to research standards from:
- Wright, 1992
- McMaster & Espin, 2007  
- Wright, 2013
CBM Web Tool
