# Code Map - CBM Writing & Spelling Tool

## Project Overview

**CBM Writing & Spelling Tool** is a comprehensive TypeScript React web application for Curriculum-Based Measurement (CBM) writing and spelling assessment. Built with Next.js 15, it provides automated scoring for educational assessments with interactive override capabilities and professional spell checking.

## Architecture

### Technology Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (ES2022 target)
- **Styling**: Tailwind CSS with shadcn/ui components
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Build Tools**: PostCSS, Autoprefixer
- **Spell Checking**: hunspell-asm (WASM)
- **Bundle Analysis**: @next/bundle-analyzer

### Project Structure

```
/Users/nickcuskey/silver-umbrella/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   └── languagetool/  # LanguageTool proxy endpoint
│   │   │       └── route.ts   # Proxy route for grammar checking
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
│   │   │   ├── bridge.ts      # Spell checker bridge for dependency injection
│   │   │   ├── hunspell-adapter.ts # Hunspell WASM integration (real implementation)
│   │   │   └── hunspell-worker-client.ts # Web Worker client for Hunspell
│   │   ├── grammar/           # Grammar checking system
│   │   │   └── languagetool-client.ts # LanguageTool API client
│   │   └── utils.ts           # Utility functions (cn helper)
│   └── workers/               # Web Workers
│       └── hunspell.worker.ts # Hunspell Web Worker implementation
├── public/
│   └── dicts/                 # Dictionary files directory
│       └── README.md          # Instructions for dictionary files
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
- **Written Expression Scoring**: TWW, WSC, CWS calculations
- **Spelling Assessment**: CLS (Correct Letter Sequences) scoring
- **Hunspell Integration**: Professional spell checking with WASM dictionaries
- **LanguageTool Grammar**: Optional grammar checking and suggestions
- **Interactive Overrides**: Click-to-toggle word and pair scoring
- **Dictionary Packs**: Grade-level appropriate word lists
- **Infraction Flagging**: Automated issue detection

**Main Components**:
- `CBMApp`: Root component with tab navigation
- `WritingScorer`: Written expression assessment tool
- `SpellingScorer`: Spelling assessment tool
- `SentenceList`: Displays parsed sentences
- `InfractionList`: Shows flagged issues

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
}

interface Infraction {
  kind: "definite" | "possible";
  tag: string;
  msg: string;
  at: number | string;
}

interface WordOverride { csw?: boolean }
interface PairOverride { cws?: boolean }
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

## Key Features

### Interactive Scoring
- **Word Overrides**: Click words to toggle WSC scoring
- **Pair Overrides**: Click carets (^) to toggle CWS pairs
- **Visual Feedback**: Color-coded indicators for correct/incorrect

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

#### Hunspell Adapter (`hunspell-adapter.ts`)
- **Real WASM Implementation**: Uses `hunspell-asm` library for professional spell checking
- `createHunspellSpellChecker()`: Factory for dictionary-based spell checker
- **Dictionary Loading**: Fetches and mounts `en_US.aff` and `en_US.dic` files from `public/dicts/`
- **Spelling Engine**: Built-in Hunspell suggestion engine for misspelled words
- **Fallback System**: Uses custom lexicon with light stemming when Hunspell not loaded
- **Memory Management**: Includes cleanup functions for repeated loads
- **UTF-8 Support**: Properly handles UTF-8 encoded dictionary files
- **Performance Optimized**: Dictionary files cached with 1-year expiration
- **Spell Result Caching**: Intelligent in-memory caching for repeated word lookups

#### Hunspell Worker Client (`hunspell-worker-client.ts`)
- Web Worker-based spell checking for large dictionaries
- `createWorkerSpellChecker()`: Factory for worker-based spell checker
- Prevents UI blocking during spell checking operations
- Async communication with worker thread
- Optimistic return values with proper error handling

### Grammar Checking System (`src/lib/grammar/`)

#### LanguageTool Client (`languagetool-client.ts`)
- `createLanguageToolChecker()`: Factory for LanguageTool grammar checker
- API integration with rate limiting support
- Advisory-only suggestions (doesn't affect CBM scores)

### API Routes (`src/app/api/`)

#### LanguageTool Proxy (`languagetool/route.ts`)
- Proxy endpoint to avoid CORS and rate limiting
- Passes through requests to LanguageTool API
- Returns grammar suggestions in standardized format

### Extensibility Points
- **Dictionary Integration**: Hunspell/LanguageTool already integrated
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
- `npm run build`: Production build
- `npm run start`: Production server
- `npm run lint`: ESLint checking
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
- Demo dictionary packs with Hunspell integration capability
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

### Future Enhancements
- Backend integration for data persistence
- Advanced grammar checking with POS tagging
- Multi-language support with additional dictionary files
- Export functionality for assessment results
- Offline dictionary support
- Performance optimizations for large dictionaries
- Web Worker implementation for non-blocking spell checking
