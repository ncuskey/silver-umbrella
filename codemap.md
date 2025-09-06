# Code Map - CBM Writing & Spelling Tool

## Project Overview

**CBM Writing & Spelling Tool** is a comprehensive TypeScript React web application for Curriculum-Based Measurement (CBM) writing and spelling assessment. Built with Next.js 14, it provides automated scoring for educational assessments with interactive override capabilities.

## Architecture

### Technology Stack
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Build Tools**: PostCSS, Autoprefixer

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
│   └── lib/
│       ├── spell/             # Spell checking system
│       │   ├── types.ts       # SpellChecker & GrammarChecker interfaces
│       │   ├── bridge.ts      # Spell checker bridge for dependency injection
│       │   └── hunspell-adapter.ts # Hunspell WASM integration
│       ├── grammar/           # Grammar checking system
│       │   └── languagetool-client.ts # LanguageTool API client
│       └── utils.ts           # Utility functions (cn helper)
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
- WASM-based spell checking integration
- `createHunspellSpellChecker()`: Factory for Hunspell spell checker
- Dictionary loading from `public/dicts/`
- Fallback to custom lexicon when not loaded

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
- **Next.js**: Default configuration with App Router
- **TypeScript**: Strict mode enabled
- **PostCSS**: Autoprefixer for browser compatibility

### Development Scripts
- `npm run dev`: Development server
- `npm run build`: Production build
- `npm run start`: Production server
- `npm run lint`: ESLint checking

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
- **Hunspell Integration**: Professional WASM-based spell checking
- **Dictionary Support**: Place `en_US.aff` and `en_US.dic` in `public/dicts/`
- **Seamless Fallback**: Uses custom lexicon when Hunspell not loaded
- **Grammar Checking**: LanguageTool integration with advisory suggestions

### Future Enhancements
- Backend integration for data persistence
- Larger dictionary databases
- Advanced grammar checking with POS tagging
- Multi-language support
- Export functionality for assessment results
- Offline dictionary support
