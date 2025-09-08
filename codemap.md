# Code Map - CBM Writing & Spelling Tool

## Project Overview

**CBM Writing & Spelling Tool** is a comprehensive TypeScript React web application for Curriculum-Based Measurement (CBM) writing and spelling assessment. Built with Next.js 15, it provides automated scoring for educational assessments with interactive override capabilities and professional spell checking via GrammarBot API.

## Architecture

### Technology Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (ES2022 target)
- **Styling**: Tailwind CSS with shadcn/ui components
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Build Tools**: PostCSS, Autoprefixer
- **Spell Checking**: GrammarBot API
- **Bundle Analysis**: @next/bundle-analyzer

### Project Structure

```
/Users/nickcuskey/silver-umbrella/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   └── grammarbot/    # GrammarBot proxy endpoint
│   │   │       └── v1/check/route.ts # Proxy route for grammar checking
│   │   ├── globals.css        # Global styles with CSS variables
│   │   ├── layout.tsx         # Root layout component
│   │   ├── page.tsx           # Main application component
│   │   └── page.tsx.backup    # Backup of main page
│   ├── components/
│   │   └── ui/                # Reusable UI components (shadcn/ui)
│   │       ├── badge.tsx      # Badge component
│   │       ├── button.tsx     # Button with variants
│   │       ├── card.tsx       # Card layout components
│   │       ├── checkbox.tsx   # Checkbox input
│   │       ├── input.tsx      # Text input
│   │       ├── tabs.tsx       # Tab navigation
│   │       └── textarea.tsx   # Textarea input
│   ├── lib/
│   │   ├── spell/             # Spell checking system
│   │   │   ├── types.ts       # SpellChecker & GrammarChecker interfaces
│   │   │   └── bridge.ts      # Spell checker bridge for dependency injection
│   │   ├── grammar/           # Grammar checking system
│   │   │   └── languagetool-client.ts # LanguageTool API client with privacy controls
│   │   ├── cws.ts             # CWS (Correct Writing Sequences) engine
│   │   ├── cws-core.ts        # Pure CWS scoring functions for testing
│   │   ├── cws-lt.ts          # CWS-LanguageTool integration for advisory hints and terminal groups
│   │   ├── cws-heuristics.ts  # Virtual terminal insertion detection system
│   │   ├── export.ts          # CSV and PDF export utilities
│   │   └── utils.ts           # Utility functions (cn helper)
│   └── workers/               # Web Workers (currently unused)
├── tests/                     # Test files
│   └── cws.spec.ts           # Golden tests for CWS rules
├── scripts/                   # Build and utility scripts (currently unused)
├── public/                    # Static assets (currently minimal)
├── Configuration Files
│   ├── package.json           # Dependencies and scripts
│   ├── next.config.js         # Next.js configuration
│   ├── tailwind.config.ts     # Tailwind CSS configuration
│   ├── postcss.config.js      # PostCSS configuration
│   ├── tsconfig.json          # TypeScript configuration
│   ├── codemap.md             # This documentation file
│   └── README.md              # Project documentation
```

## Core Components

### Main Application (`src/app/page.tsx`)

**Purpose**: Single-page application containing both writing and spelling assessment tools.

**Key Features**:
- **Written Expression Scoring**: TWW, WSC, CWS calculations with derived metrics
- **Spelling Assessment**: CLS (Correct Letter Sequences) scoring
- **LanguageTool Integration**: Professional spell checking via LanguageTool API
- **Automatic Loading**: LanguageTool provides spell checking automatically on app startup
- **Spell Engine Status**: Visual indicator showing LanguageTool spell checking mode
- **Auto-validation**: Automatic LanguageTool integration with sanity checks
- **Spelling Suggestions**: Tooltip suggestions for misspelled words
- **LanguageTool Grammar**: Automatic grammar checking with debounced text analysis
- **Request Cancellation**: AbortSignal support for grammar checking requests
- **Interactive Overrides**: Click-to-toggle word and pair scoring
- **Dictionary Packs**: Grade-level appropriate word lists
- **Infraction Flagging**: Automated issue detection with IWS categorization
- **Curly Apostrophe Support**: Proper handling of smart quotes and apostrophes
- **Derived Metrics**: CIWS, %CWS, and CWS/min calculations with time control
- **Missing Punctuation Detection**: Heuristic advisory for capitalized words not preceded by terminal punctuation
- **Combined Boundary Detection**: LanguageTool + paragraph-end fallback with intelligent deduplication
- **Context-Aware Comma Filtering**: Smart filtering that keeps list commas but removes clause-structuring commas
- **Grammar Mode Badge**: Always-visible indicator showing current grammar configuration
- **Export Functionality**: CSV audit export and PDF report generation
- **Privacy Controls**: FERPA/COPPA compliant local-only mode with session data clearing
- **Self-hosted LanguageTool**: Support for custom LanguageTool endpoints with privacy toggle
- **Rate Limiting**: Exponential backoff for LanguageTool API rate limits
- **Golden Tests**: Comprehensive test suite for CWS rule validation
- **License Compliance**: LanguageTool API usage compliance

**Main Components**:
- `CBMApp`: Root component with tab navigation
- `WritingScorer`: Written expression assessment tool
- `SpellingScorer`: Spelling assessment tool
- `SentenceList`: Displays parsed sentences
- `InfractionList`: Shows flagged issues
- `TerminalSuggestions`: Displays terminal groups as clickable suggestions with bulk toggle functionality

### Scoring Algorithms

#### Written Expression Metrics

1. **TWW (Total Words Written)**
   - Counts all words, including misspellings
   - Excludes numerals
   - Implementation: `computeTWW()`

2. **WSC (Words Spelled Correctly)**
   - Uses dictionary packs + custom lexicon
   - Supports manual overrides
   - Implementation: `computeWSC()`

3. **CWS (Correct Writing Sequences)**
   - Adjacent unit pairs across words and punctuation
   - Excludes commas
   - Rule-based validation (capitalization, terminals)
   - Implementation: `computeCWS()`

#### Spelling Metrics

1. **CLS (Correct Letter Sequences)**
   - Partial credit for spelling attempts
   - Boundary + adjacent letter pairs
   - Implementation: `clsForWord()`

### Data Structures

#### Core Types
```typescript
interface Token {
  raw: string;
  type: UnitType;
  idx: number;
  start?: number;  // 0-based char offset in raw text
  end?: number;    // 0-based char offset in raw text (exclusive)
}

interface Infraction {
  kind: "definite" | "possible";
  tag: string;
  msg: string;
  at: number | string;
}

interface WordOverride { csw?: boolean }
interface PairOverride { cws?: boolean }

interface CwsHint {
  bIndex: number;          // -1 or token index
  message: string;
  ruleId?: string;
  categoryId?: string;
}
```

#### Dictionary System
- **Demo Packs**: `us-k2`, `us-k5`, `general`
- **Custom Lexicon**: User-defined words
- **Lexicon Builder**: `buildLexicon()` function

### UI Components (shadcn/ui)

#### Component Library (`src/components/ui/`)

1. **Card Components** (`card.tsx`)
   - `Card`, `CardHeader`, `CardTitle`, `CardContent`
   - Consistent layout structure

2. **Button Component** (`button.tsx`)
   - Multiple variants: default, destructive, outline, secondary, ghost, link
   - Size variants: default, sm, lg, icon
   - Uses class-variance-authority for styling

3. **Form Components**
   - `Input`: Text input with consistent styling
   - `Textarea`: Multi-line text input
   - `Checkbox`: Boolean input with custom styling
   - `Tabs`: Tab navigation system

4. **Display Components**
   - `Badge`: Status indicators with variants

### Styling System

#### Tailwind Configuration (`tailwind.config.ts`)
- Custom color system with CSS variables
- Extended border radius system
- Content paths for all source files

#### Global Styles (`src/app/globals.css`)
- CSS variable definitions for light/dark themes
- Base layer styles
- Tailwind directives

#### Utility Functions (`src/lib/utils.ts`)
- `cn()`: Combines clsx and tailwind-merge for conditional classes
- `DEBUG`: Enhanced debug flag supporting multiple activation methods (URL parameter, localStorage, environment variable)
- `dlog()`: Debug logging function that respects DEBUG flag
- `dgroup()`: Debug grouping function for organized console output
- `dtable()`: Debug table function for structured data display

## Key Features

### Interactive Scoring
- **Word Overrides**: Click words to toggle WSC scoring
- **Pair Overrides**: Click carets (^) to cycle CWS states (yellow→red→green→yellow)
- **Visual Feedback**: Color-coded indicators for correct/incorrect/advisory
- **3-State Cycling**: Yellow (advisory), Red (incorrect), Green (correct), Yellow (default)

### Automated Validation
- **Spelling Detection**: Dictionary-based spell checking
- **Grammar Rules**: Capitalization, terminal punctuation
- **Infraction Categories**: Definite vs. possible issues

### Spell Checking System (`src/lib/spell/`)

#### Types (`types.ts`)
- `SpellChecker` interface: Core spell checking functionality
- `GrammarChecker` interface: Grammar checking with LanguageTool
- `GrammarIssue` interface: Grammar issue representation

#### Bridge (`bridge.ts`)
- Dependency injection system for spell checkers
- `setExternalSpellChecker()`: Register spell checker implementation
- `getExternalSpellChecker()`: Retrieve current spell checker

#### LanguageTool Integration
- **API-based Spell Checking**: Uses LanguageTool's public API for professional spell checking
- **Automatic Grammar Checking**: Grammar analysis runs automatically as you type with debounce
- **Status Tracking**: Visual badge shows LanguageTool spell checking mode
- **Spelling Suggestions**: Built-in LanguageTool suggestion engine for misspelled words
- **Tooltip Integration**: Suggestions appear in word tooltips when words are flagged
- **Seamless Fallback**: Uses custom lexicon with light stemming when LanguageTool unavailable
- **Spell Result Caching**: Intelligent in-memory caching for repeated word lookups

### Grammar Checking System (`src/lib/grammar/`)

#### LanguageTool Client (`languagetool-client.ts`)
- `createLanguageToolChecker()`: Factory for LanguageTool grammar checker
- API integration with rate limiting support
- **Enhanced Spelling Detection**: Properly configured to detect typos (MORFOLOGIK_RULE_* patterns) alongside grammar issues
- **Language Variant Support**: Uses `en-US` variant and `preferredVariants` for auto-detection to ensure spelling rules remain active
- **Website Parity**: Matches LanguageTool website defaults with `level=default` parameter
- **AbortSignal Support**: Request cancellation to prevent stale results
- **Automatic Grammar Checking**: Debounced text analysis with 800ms delay
- Advisory-only suggestions (doesn't affect CBM scores)

### CWS-LanguageTool Integration (`src/lib/cws-lt.ts`)

#### Robust LT Field Shims
- **Field-Agnostic Accessors**: `ltRuleId()`, `ltCategoryId()`, `ltMsg()`, `ltOffset()`, `ltLength()`, `ltMarkedText()` handle multiple LanguageTool server payload shapes
- **Cross-Server Compatibility**: Works seamlessly with different LT server configurations and response formats
- **Enhanced Field Handling**: `ltMarkedText()` handles unusual cases where flagged text is provided in non-standard fields like `"len": "Nobody"`
- **Backward Compatibility**: Legacy aliases (`getRuleId`, `getCategoryId`, etc.) maintained for seamless integration
- **Robust Error Handling**: Proper undefined checks and fallback values throughout

#### Resilient Token Locator System
- **Multi-Strategy Locator**: `locateStartToken()` with three fallback strategies:
  1. **Exact Offset**: Find token at exact character offset
  2. **First Word After**: If exact match fails, find first word token after offset
  3. **By Matched Text**: If both fail, search by actual flagged text content
- **Helper Functions**: `tokenAtOffset()`, `firstWordAfter()`, `findByRaw()`, `prevNonSpaceIndex()`
- **Enhanced Error Handling**: Proper undefined checks for token start/end positions
- **Diagnostic Support**: `debugLtToVt()` provides helpful diagnostics when no insertions are generated

#### Intelligent Comma Filtering System
- `isCommaOnlyForCWS()`: Smart CWS comma policy with Oxford/serial comma preservation
- **Oxford Comma Detection**: Preserves Oxford/serial commas in patterns like "apples, oranges, and bananas"
- **Clause Filtering**: Removes clause-structuring commas (e.g., "…, and I") from CWS suggestions
- **Direct Token Analysis**: Uses efficient token analysis instead of complex scanning
- **Replacement Analysis**: Checks both rule IDs and actual replacement values for comma detection

#### Smart LanguageTool Boundary Detection
- `suggestsTerminal()`: Detects terminal punctuation suggestions in LanguageTool replacements
- `ltBoundaryInsertions()`: Completely rewritten multi-signal boundary detection with sophisticated analysis:
  - **Replacement Signals**: Detects when LT suggests adding terminal punctuation (`.`, `!`, `?`)
  - **Message Signals**: Analyzes LT messages for explicit boundary mentions using regex patterns
  - **Structural Signals**: Detects patterns like "forest The" with capitalized words following non-terminal words
- `tokenIndexAt()`: Enhanced helper function for precise character position to token mapping
- `BOUNDARY_CATEGORIES`: New constant set for filtering relevant LT categories (PUNCTUATION, GRAMMAR, STYLE, TYPOGRAPHY)
- **Coordinating Conjunction Filtering**: Prevents false positives with conjunctions like "and", "or", "but", "so", "then", "yet"
- **Debug Logging**: Conditional debug output for boundary detection troubleshooting with `window.__CBM_DEBUG__`
- **Category-Aware Filtering**: Respects punctuation/grammar categories while applying comma filtering

#### CWS Advisory Hints System
- `buildLtCwsHints()`: Maps LanguageTool grammar issues to CWS boundaries
- **Smart Boundary Mapping**: Grammar issues mapped to nearest CWS boundaries within ±2 characters
- **Enhanced Category Filtering**: Properly excludes spelling issues (TYPOS, MORFOLOGIK_RULE_*) from CWS boundary mapping
- **Comma-Filtered Processing**: Uses refined comma filtering to improve hint quality
- **Advisory Hints**: Grammar suggestions shown as yellow carets and advisory infractions
- **Override Awareness**: Advisory hints disappear when users explicitly override boundary states

#### Integration & Wiring Logic (`src/app/page.tsx`)
- **Enhanced Deduplication**: Clean deduplication using `Set<number>` for `beforeBIndex` tracking instead of simple array filtering
- **LT-First Priority**: LanguageTool boundary detection runs first, with paragraph-end detection as fallback
- **Smart Filtering**: Uses `isCommaOnlyForCWS()` to filter comma-only issues before boundary detection
- **Comprehensive Logging**: Console output shows counts for LT insertions, paragraph-end insertions, and final deduplicated count
- **Efficient Memoization**: All computations properly memoized to avoid unnecessary recalculations
- **Type Safety**: Fixed TypeScript compatibility with proper union types for terminal insertions

#### Terminal Group System
- `buildTerminalGroups()`: Groups LT punctuation/grammar issues with three related carets
- `deriveTerminalFromLT()`: Analyzes LT issues to find terminal punctuation problems
- `convertLTTerminalsToInsertions()`: Converts LT-derived terminals to VirtualTerminalInsertion format
- **Three-Caret Structure**: Each group contains groupLeftCaret, primaryCaret, and groupRightCaret
- **Smart Boundary Detection**: Uses LT match offset/length to find primary caret, then expands to sentence boundaries
- **LT Rule Detection**: Specifically handles PUNCTUATION_PARAGRAPH_END and UPPERCASE_SENTENCE_START rules
- **Defensive Text Matching**: Uses regex patterns to catch other sentence/punctuation issues LT might report
- **Bulk Toggle Operations**: One-click cycling of all three carets simultaneously
- **Independent Groups**: Each terminal group operates independently without cross-coupling
- **Edge Case Handling**: Properly handles start-of-text and end-of-text boundaries

### Missing Punctuation Detection (`src/lib/cws-heuristics.ts`)

#### Virtual Terminal Insertion System
- `detectMissingTerminalInsertions()`: Advanced detection algorithm for missing sentence-ending punctuation
- `detectParagraphEndInsertions()`: Fallback detection for paragraph endings without terminal punctuation
- **Paragraph-End Detection**: Uses regex pattern to find paragraph breaks and end-of-text boundaries
- **Terminal Check**: Verifies if terminal punctuation already exists after the last word
- **Fallback Safety**: Ensures coverage of cases like "The Terrible Day." even when LanguageTool misses them
- `createVirtualTerminals()`: Converts insertion objects to comprehensive VirtualTerminal type with boundary tracking
- **Smart Pattern Recognition**: Detects WORD [space] CapitalWord sequences that look like new sentences
- **Heuristic Filtering**: Uses contextual clues (newlines, 2+ spaces, sentence starters) to reduce false positives
- **Title Case Avoidance**: Excludes TitleCase spans like "The Terrible Day" to prevent over-flagging
- **Visual Insertion**: Creates dotted "." tokens with distinct amber styling and dashed borders
- **Two-Caret System**: Generates two yellow advisory carets around each virtual terminal (word ^ . and . ^ NextWord)
- **Interactive Control**: Teachers can click carets to cycle: yellow (advisory) → red (reject) → green (accept)
- **One-Click Group Cycling**: Click virtual terminal dots to cycle both adjacent carets simultaneously in lock-step
- **CWS Integration**: When accepted (green), virtual terminals count as essential punctuation creating two CWS boundaries
- **Advisory by Default**: Virtual terminals don't affect CWS scores unless explicitly accepted by teacher
- **Clear Visual Feedback**: Distinct styling, hover effects, and tooltips clearly indicate proposed insertions vs. actual text
- **Accessibility**: Keyboard navigation support with Enter/Space key activation for virtual terminal dots
- **Comprehensive Tracking**: Each virtual terminal tracks dotTokenIndex, leftBoundaryBIndex, and rightBoundaryBIndex

#### Derived Metrics System
- **CIWS (Correct Incorrect Writing Sequences)**: CWS minus IWS calculation
- **%CWS**: Percentage of CWS out of eligible boundaries
- **CWS/min**: Writing fluency rate with configurable time control
- **IWS Categorization**: Detailed categorization by reason (capitalization, spelling, punctuation, pair)
- **Time Control**: Configurable probe duration in mm:ss format for accurate fluency calculations

### Export System (`src/lib/export.ts`)

#### Export Utilities
- `toCSV()`: Converts array of objects to CSV format with proper escaping
- `download()`: Client-side file download using Blob API
- **CSV Export**: Detailed audit data including boundary index, tokens, eligibility, validity, overrides
- **PDF Export**: Screenshots metrics panel with high-quality rendering (2x scale)

### Privacy & Compliance System

#### Privacy Controls (`src/lib/grammar/languagetool-client.ts`)
- `getLtBase()`: Retrieves LanguageTool base URL from localStorage
- `getLtPrivacy()`: Gets privacy setting (local/cloud) with FERPA/COPPA default
- `clearSessionData()`: Clears all session data and resets to defaults
- **Default Local-Only**: Grammar checking disabled by default for student privacy
- **Privacy Toggle**: Easy enable/disable of cloud grammar checking
- **Session Management**: Complete reset of settings and student text

#### License Compliance (`scripts/check-licenses.mjs`)
- **Prebuild Validation**: License compliance check runs before every build
- **SCOWL Attribution**: Proper attribution for dictionary word lists (LGPL/MPL)
- **LanguageTool Attribution**: Proper attribution for LanguageTool API usage
- **Automatic Enforcement**: Build fails if license file is missing or empty

### Testing System (`tests/cws.spec.ts`)

#### Golden Tests
- **Vitest Integration**: Modern testing framework with UI and CLI modes
- **CWS Rule Validation**: Tests for initial-word credit, terminal capitalization, comma handling
- **Edge Cases**: Tests for quotes, parentheses, hyphens, apostrophes, and numerals
- **Virtual Terminal Tests**: Tests for missing punctuation detection, Figure 4 behavior, and group cycling
- **Behavior Locking**: Golden test ensures virtual terminal cycling behavior remains consistent
- **Pure Functions**: `src/lib/cws-core.ts` provides testable scoring functions
- **Continuous Integration**: Tests run automatically on build

### Debug System (`src/lib/utils.ts` & `src/app/layout.tsx`)

#### Enhanced Debug Infrastructure
- **Multi-Method Activation**: Debug mode can be enabled via URL parameter (`?debug=1`), localStorage, environment variable, or browser console
- **Production-Safe**: Debug mode can be forced in production environments for troubleshooting
- **Persistent Storage**: URL-based activation persists across sessions via localStorage
- **Boot Script**: Early initialization script in layout.tsx runs before React to set up debug mode
- **Environment Support**: `NEXT_PUBLIC_CBM_DEBUG=1` for preview deploys and production debugging

#### Debug Functions
- **`dlog()`**: Conditional console logging that respects DEBUG flag
- **`dgroup()`**: Organized console grouping with try/finally cleanup
- **`dtable()`**: Structured table display for debugging data
- **Runtime Control**: Debug mode can be toggled at runtime via `window.__CBM_DEBUG__`

#### Debug Activation Methods
1. **URL Parameter**: `?debug=1` - Most user-friendly method
2. **Browser Console**: `window.__CBM_DEBUG__ = true` - Developer method
3. **Environment Variable**: `NEXT_PUBLIC_CBM_DEBUG=1` - Production/preview method
4. **Persistent Storage**: Automatic re-enablement from localStorage

### API Routes (`src/app/api/`)

#### LanguageTool Proxy (`languagetool/route.ts`)
- Proxy endpoint to avoid CORS and rate limiting
- Passes through requests to LanguageTool API
- Returns grammar suggestions in standardized format

### Extensibility Points
- **Dictionary Integration**: LanguageTool already integrated
- **Rule Engine**: Add POS-based grammar checking
- **Language Support**: Multi-language dictionary support

## Configuration

### Build Configuration
- **Next.js**: Standalone output with bundle analyzer integration
- **TypeScript**: ES2022 target with strict mode for modern performance
- **PostCSS**: Autoprefixer for browser compatibility
- **Bundle Analysis**: @next/bundle-analyzer for performance monitoring

### Development Scripts
- `npm run dev`: Development server
- `npm run build`: Production build (includes license compliance check)
- `npm run start`: Production server
- `npm run lint`: ESLint checking
- `npm run test`: Run tests with Vitest UI
- `npm run test:run`: Run tests in command line mode
- `npm run size:report`: Analyze dependency sizes
- `npm run analyze`: Generate bundle analysis reports

## Research Alignment

The tool implements scoring methods aligned with educational research:
- **Wright, 1992**: CBM writing assessment standards
- **McMaster & Espin, 2007**: Writing sequence validation
- **Wright, 2013**: Updated CBM guidelines

## File Dependencies

### Critical Dependencies
- `src/app/page.tsx` → All UI components, scoring algorithms
- `src/components/ui/*` → `src/lib/utils.ts` for styling
- `src/app/layout.tsx` → `src/app/globals.css` for global styles

### External Dependencies
- **Next.js**: Framework and routing
- **React**: Component library
- **Framer Motion**: Animations
- **Lucide React**: Icons
- **Tailwind CSS**: Styling
- **class-variance-authority**: Component variants

## Development Notes

### Current State
- Single-page application with tabbed interface
- Demo dictionary packs with LanguageTool integration
- LanguageTool grammar checking with proxy API
- Client-side only (no backend integration)
- Responsive design with mobile support

### Spell Checking Features
- **Dictionary Integration**: Custom parser for LibreOffice dictionary files
- **500K+ Word Support**: Full US English dictionary with professional spell checking
- **Spelling Suggestions**: Edit distance algorithm for word suggestions
- **Seamless Fallback**: Uses custom lexicon when dictionary not loaded
- **Grammar Checking**: LanguageTool integration with advisory suggestions

### TypeScript Configuration

#### Build Compatibility (`tsconfig.json`)
- **Target**: ES2022 for modern performance and WASM compatibility
- **Downlevel Iteration**: Disabled for better performance with ES2022 target
- **Strict Mode**: Full type checking enabled
- **Module Resolution**: Bundler mode for Next.js compatibility

#### Deployment Considerations
- **Modern Browser Support**: ES2022 target provides better performance and WASM compatibility
- **Performance Optimized**: Disabled downlevelIteration for faster builds
- **Bundle Analysis**: Integrated bundle analyzer for performance monitoring
- **Build Process**: Optimized for production builds with proper TypeScript compilation

### Recent Updates

#### Latest Improvements (v5.3) - N+1 Caret Boundary System
- **N+1 Caret Architecture**: Implemented proper boundary-based caret system with N+1 carets (one for each boundary including end-of-text)
- **Interleaved Grid Layout**: Carets now render as real grid cells between tokens instead of overlays, eliminating transform/positioning issues
- **Enhanced Boundary Mapping**: Updated `buildCaretRow()` to return `Array(tokens.length + 1)` for complete boundary coverage
- **End-of-Text Support**: Fixed `gbToVT.ts` to properly map end-of-text insertions to `tokens.length` boundary index
- **Visual Improvements**: Carets now sit in gaps between words with proper CSS styling (ghost: 25% opacity, active: yellow)
- **Grid-Based Rendering**: Single CSS grid with `gridAutoFlow: "column"` alternates caret/token cells for clean visual layout
- **Type Safety**: Added proper TypeScript types for `CaretState` and `Cell` union types
- **Debug Enhancement**: Console logging now shows correct caret count (N+1) and final boundary index for end-of-text insertions

#### Recent Improvements (v5.3) - Responsive Flex Layout
- **Flexible Container Layout**: Replaced CSS grid with flexbox layout for better responsive behavior
- **Wrapping Support**: Added `flex-wrap: wrap` to allow content to wrap to new lines on smaller screens
- **Improved Spacing**: Maintained 8px gap between tokens and carets with `gap: 8px`
- **Cell Styling**: Added `.cbm-cell` class with `flex: 0 0 auto` to prevent unwanted stretching
- **Visual Consistency**: Preserved existing pill styles (correct/possible/incorrect) and caret styling (ghost/active)
- **Responsive Design**: Container now adapts to different screen sizes while maintaining visual hierarchy
- **CSS Organization**: Added new flex styles to `globals.css` with clear documentation comments

#### Previous Improvements (v5.2) - API Proxy Rule Filtering Fix
- **Fixed Rule Filtering**: Updated API proxy to properly handle form data and prevent artificial rule restrictions
- **Full Grammar Checking**: Client now explicitly requests comprehensive checks with `level=default` and `enabledOnly=false`
- **Enhanced Debug Logging**: Added detailed request parameter logging and match count tracking
- **Form Data Processing**: API proxy now uses `req.formData()` instead of `req.text()` for proper parameter handling
- **Rule Parameter Cleanup**: Explicitly removes `enabledCategories`, `enabledRules`, `disabledCategories`, and `disabledRules` unless client sends them
- **Client Parameter Enhancement**: Updated `checkWithLT()` to include proper parameters for full grammar checking
- **Debug Visibility**: Enhanced logging shows all request parameters and response match counts for troubleshooting

#### Previous Improvements (v4.5) - UPPERCASE Boundary-Aware Insertion
- **Boundary-Aware UPPERCASE Detection**: Enhanced UPPERCASE_SENTENCE_START processing that uses boundary caret ("^") ownership for proper VT integration
- **Helper Functions**: Added `isWord()`, `prevWordIndex()`, and `nearestBoundaryLeftOf()` for sophisticated boundary detection
- **VT Ownership System**: Virtual terminals now use `beforeBIndex: boundaryIdx` for boundary-based ownership instead of word-based positioning
- **Visual Position Accuracy**: Dots still render after the previous word (correct visual placement) while using boundary carets for VT grouping
- **Enhanced Debug Logging**: Added comprehensive console logging showing word indices, boundary indices, and insertion decisions
- **Guardrail Protection**: Prevents duplicate insertions and avoids placing terminals before opening quotes or existing terminals
- **Paragraph/Terminator Enhancement**: Applied same boundary-aware logic to paragraph-end and missing terminator rules
- **CWS Integration**: Ensures virtual terminals participate correctly in the `vtByBoundary`/grouping pipeline for proper teacher controls

#### Previous Improvements (v4.4) - Robust Shims & Resilient Token Locator
- **Robust LT Field Shims**: Added comprehensive shim functions (`ltRuleId`, `ltCategoryId`, `ltMsg`, `ltOffset`, `ltLength`, `ltMarkedText`) that handle multiple LanguageTool server payload shapes
- **Resilient Token Locator**: Implemented `locateStartToken()` with three fallback strategies: (1) exact offset, (2) first word after offset, (3) by matched text
- **Enhanced Field Handling**: New `ltMarkedText()` function handles unusual cases where flagged text is provided in non-standard fields like `"len": "Nobody"`
- **Backward Compatibility**: Maintained legacy function aliases (`getRuleId`, `getCategoryId`, etc.) for seamless integration
- **Improved Converter**: Updated `convertLTTerminalsToInsertions()` to accept text parameter and use the new resilient locator
- **Diagnostic Support**: Added `debugLtToVt()` function that provides helpful diagnostics when no insertions are generated
- **Enhanced Error Handling**: Proper undefined checks for token start/end positions throughout the locator system
- **Cross-Server Robustness**: Works reliably with different LanguageTool server configurations and response formats

#### Previous Improvements (v3.9) - Smarter LT Boundary Extraction
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

#### Previous Improvements (v3.0) - LanguageTool Only
- **Simplified Architecture**: Removed Hunspell and local dictionaries, now uses LanguageTool API exclusively
- **Enhanced Spell Checking**: Professional spell checking via LanguageTool's MORFOLOGIK_RULE_EN_US and TYPOS categories
- **Improved Performance**: Eliminated local dictionary loading and WASM dependencies
- **Better Suggestions**: Spelling suggestions now come directly from LanguageTool's comprehensive database
- **Streamlined Codebase**: Removed 9 packages and simplified spell checking logic
- **API-First Design**: All spell checking now goes through LanguageTool's public API with proper rate limiting
- **Misspelling Index**: Built from LanguageTool results for efficient spell checking
- **Unified API**: Both spell checking and grammar checking use the same LanguageTool service

#### Previous Improvements (v2.10)
- **Enhanced Virtual Terminal System**: Comprehensive boundary tracking with proper CWS integration when accepted
- **One-Click Group Cycling**: Revolutionary feature allowing teachers to click virtual terminal dots to cycle both adjacent carets simultaneously
- **Improved Accessibility**: Added keyboard navigation support with Enter/Space key activation for virtual terminal dots
- **Visual Polish**: Enhanced hover effects and focus states for better user experience
- **Golden Test Coverage**: Added comprehensive test for virtual terminal cycling behavior to prevent regressions
- **Figure 4 Compliance**: Enhanced missing terminal detection with proper handling of quotes, parentheses, and TitleCase runs
- **LanguageTool Integration**: Improved mapping of punctuation-related grammar issues to advisory carets

#### Previous Improvements (v2.8)
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

#### Previous Improvements (v2.7)
- **Virtual Terminal Insertion**: Revolutionary feature that automatically detects and proposes missing sentence-ending punctuation
- **Smart Heuristics**: Advanced detection algorithm that identifies WORD [space] CapitalWord patterns likely to be new sentences
- **Interactive Teacher Control**: Two-caret system allows teachers to accept/reject virtual terminal suggestions
- **One-Click Group Cycling**: Click virtual terminal dots to cycle both adjacent carets simultaneously in lock-step
- **Visual Distinction**: Dotted amber styling clearly distinguishes proposed insertions from actual student text
- **CWS Integration**: Virtual terminals integrate seamlessly with CWS scoring when accepted by teachers
- **Advisory by Default**: Virtual suggestions don't affect scores unless explicitly accepted, maintaining assessment integrity
- **Enhanced User Experience**: Clear visual feedback and intuitive interaction model for efficient teacher workflow
- **Accessibility Support**: Keyboard navigation with Enter/Space key activation for virtual terminal dots
- **Comprehensive Boundary Tracking**: Each virtual terminal tracks its dot token index and associated CWS boundary indices

#### Previous Improvements (v2.6)
- **UI Refactoring**: Complete redesign with cleaner, more professional interface
- **Two-Column Layout**: Left column for text input and controls, right column for metrics and infractions
- **Compact Metrics Grid**: 6 metrics displayed in a responsive 2×3 grid using consistent StatCard components
- **Streamlined Controls**: Removed obsolete dictionary pack toggles, custom lexicon input, and show/hide checkboxes
- **Always-Visible Infractions**: Infractions and suggestions are now always displayed for immediate review
- **Simplified Workflow**: Hardcoded defaults for dictionary packs and custom lexicon eliminate configuration overhead
- **Enhanced Visual Hierarchy**: Better organization with logical grouping of related elements
- **Responsive Design**: Grid layout adapts to different screen sizes for optimal viewing

#### Previous Improvements (v2.5)
- **Derived Metrics**: Added CIWS, %CWS, and CWS/min calculations with comprehensive time control
- **Time Control**: Configurable probe duration (mm:ss format) for accurate fluency rate calculations
- **IWS Categorization**: Detailed categorization of Incorrect Writing Sequences by reason (capitalization, spelling, punctuation, pair)
- **Missing Punctuation Detection**: Created `src/lib/cws-heuristics.ts` for heuristic advisory system
- **Grammar Mode Badge**: Always-visible indicator showing current grammar checking configuration
- **Enhanced Infractions Panel**: Improved categorization and display of writing sequence issues
- **Smart Heuristics**: Context-aware detection that reduces false positives for proper nouns
- **Interactive Time Input**: User-friendly time input control integrated with existing UI
- **Unified Advisory System**: Combined LanguageTool and heuristic hints into single advisory system

#### Previous Improvements (v2.4)
- **Token Character Offsets**: Added `start` and `end` properties to Token interface for precise character position tracking
- **Enhanced Tokenizer**: Updated tokenization to use `matchAll()` for capturing character positions
- **CWS-LanguageTool Integration**: Created `src/lib/cws-lt.ts` for mapping grammar issues to CWS boundaries
- **3-State Caret Cycling**: Enhanced caret interaction with yellow (advisory) → red (incorrect) → green (correct) → yellow (default)
- **Advisory Hints**: LanguageTool grammar suggestions now appear as yellow carets and advisory infractions
- **Smart Boundary Mapping**: Grammar issues mapped to nearest CWS boundaries within ±2 character window
- **Advisory Infractions**: Grammar suggestions shown as "CWS (advisory)" entries in infractions panel
- **Color Legend**: Added visual guide above token stream explaining caret color meanings for teachers
- **Enhanced User Experience**: Clear cycling instructions and improved tooltips for better teacher usability

#### Previous Improvements (v2.2)
- **Smart Engine Tagging**: Added `engineTag` dependency tracking that forces all scoring to recompute when LanguageTool loads
- **Enhanced Cache Management**: Engine-tagged spell caching with `lt:word` vs `demo:word` keys prevents demo results from being reused after LanguageTool loads
- **Automatic Cache Clearing**: Spell cache is automatically cleared when LanguageTool loads via `spellCache.current.clear()` after `setExternalSpellChecker()`
- **Improved Visual Feedback**: Red badges (`bg-red-100 text-red-700 border-red-300`) for misspelled words, green badges (`bg-emerald-50 text-emerald-700 border-emerald-200`) for correct words
- **Stricter Grammar Filtering**: LanguageTool filtering now only shows spelling suggestions for genuine typos
- **Better Override Handling**: Manual overrides properly respected with `effectiveOk` logic in both scoring and visual display
- **Enhanced Re-scoring**: All `useMemo` dependencies include `engineTag` to force re-computation when spell engine changes
- **Sticky Grammar Client**: LanguageTool client now "sticks" to proxy or public endpoint to avoid repeated failed requests
- **Grammar Status Display**: Grammar badge now shows whether using proxy or public endpoint for better transparency
- **Memoized Filtered LT**: Created `filteredLt` memoized value to avoid redundant filtering operations

#### Previous Updates
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
- **LanguageTool Grammar**: Advisory grammar checking with API proxy
- **Web Worker Support**: Non-blocking spell checking for large dictionaries

### Future Enhancements
- Backend integration for data persistence
- Advanced grammar checking with POS tagging
- Multi-language support with additional dictionary files
- Export functionality for assessment results
- Offline dictionary support
- Performance optimizations for large dictionaries
- Web Worker implementation for non-blocking spell checking
