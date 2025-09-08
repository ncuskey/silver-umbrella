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
│   │   └── page.tsx           # Main application component
│   ├── components/
│   │   ├── ui/                # Reusable UI components (shadcn/ui)
│   │   │   ├── badge.tsx      # Badge component
│   │   │   ├── button.tsx     # Button with variants
│   │   │   ├── card.tsx       # Card layout components
│   │   │   ├── checkbox.tsx   # Checkbox input
│   │   │   ├── input.tsx      # Text input
│   │   │   ├── tabs.tsx       # Tab navigation
│   │   │   └── textarea.tsx   # Textarea input
│   │   └── TerminalGroup.tsx  # Terminal group component for ^ . ^ units
│   ├── lib/
│   │   ├── gbClient.ts        # GrammarBot API client
│   │   ├── gbToVT.ts          # GrammarBot to Virtual Terminal conversion
│   │   ├── gbAnnotate.ts      # GrammarBot annotation and display logic
│   │   ├── gb-map.ts          # GB state mapping and terminal group initialization
│   │   ├── tokenize.ts        # Text tokenization
│   │   ├── types.ts           # Core type definitions
│   │   ├── export.ts          # CSV and PDF export utilities
│   │   ├── utils.ts           # Utility functions
│   │   └── [legacy files]     # Unused legacy files (cws-lt.ts, cws.ts, etc.)
│   └── workers/               # Web Workers (currently unused)
├── tests/                     # Test files
│   └── cws.spec.ts           # Golden tests for CWS rules
├── __tests__/                 # Additional test files
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
- **Terminal Group Functionality**: Unified (^ . ^) groups as single, clickable units with synchronized state
- **Spelling Assessment**: CLS (Correct Letter Sequences) scoring
- **GrammarBot Integration**: Professional spell checking and grammar analysis via GrammarBot API
- **Interactive UI**: Clickable carets, tokens, and terminal groups with keyboard navigation
- **Group State Management**: Separate state tracking for individual tokens and terminal groups
- **Focus Management**: Visual focus indicators and selection rings for accessibility
- **Export Functionality**: CSV audit export and PDF report generation
- **Responsive Design**: Mobile-friendly interface with flex layout

**Main Components**:
- `CBMApp`: Root component with tab navigation
- `WritingScorer`: Written expression assessment tool
- `SpellingScorer`: Spelling assessment tool
- `TerminalGroup`: Unified terminal group component for ^ . ^ units
- `SentenceList`: Displays parsed sentences
- `InfractionList`: Shows flagged issues

### Scoring Algorithms

#### Written Expression Metrics

1. **TWW (Total Words Written)**
   - Counts all words, including misspellings
   - Excludes numerals
   - Implementation: `computeTWW()`

2. **WSC (Words Spelled Correctly)**
   - Uses GrammarBot API for professional spell checking
   - Supports manual overrides via terminal group cycling
   - Implementation: `calcWSC()` with `spellErrorSetFromGB()`

3. **CWS (Correct Writing Sequences)**
   - Adjacent unit pairs across words and punctuation
   - Excludes commas from CWS calculations
   - Rule-based validation (capitalization after terminals, spelling accuracy)
   - Implementation: `calcCWS()` with `capitalizationFixWordSet()` and `terminalBoundarySet()`

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

interface VirtualTerminalInsertion {
  at: number;
  char: "." | "!" | "?";
  beforeBIndex: number;
  reason: "GB";
  message: string;
}

interface DisplayToken extends Token {
  ui: "correct" | "possible" | "incorrect";
  overlay?: string;
  gbHits?: any[];
}
```

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
- **CBM Flow Styles**: Flex-based layout for token/caret display
- **Interactive Styles**: Focus indicators and hover states
- **Caret Styles**: Ghost (25% opacity) and active (yellow) caret states
- **Token Styles**: Correct (green), possible (amber), incorrect (red) pill styles
- **Insertion Styles**: Yellow dot styling for punctuation insertions
- **Terminal Group Styles**: Unified styling for `.cbm.token`, `.cbm.caret`, and `.cbm.insert-dot` states
- **New Terminal Group CSS**: `.tg`, `.tg--ok`, `.tg--maybe`, `.tg--bad` with unified borders and backgrounds
- **Non-Interactive Children**: `.tg__inner` with `pointer-events: none` for inner tokens
- **Selection Indicators**: Visual selection rings (`.is-selected`) for both tokens and groups
- **Paragraph Spacing**: `.linebreak` styling for proper paragraph separation

#### Utility Functions (`src/lib/utils.ts`)
- `cn()`: Combines clsx and tailwind-merge for conditional classes
- `DEBUG`: Enhanced debug flag supporting multiple activation methods
- `dlog()`: Debug logging function that respects DEBUG flag
- `dgroup()`: Debug grouping function for organized console output
- `dtable()`: Debug table function for structured data display

## Key Features

### Interactive Scoring
- **Word Overrides**: Click words to toggle WSC scoring
- **Terminal Group Cycling**: Click any member of (^ . ^) groups to cycle entire group state
- **Unified Group State**: All members of terminal groups maintain synchronized visual state
- **Caret Navigation**: Click carets (^) to cycle CWS states
- **Visual Feedback**: Color-coded indicators for correct/incorrect/advisory
- **Keyboard Navigation**: Arrow keys, Enter/Space for accessibility
- **Focus Management**: Visual focus indicators with yellow outline rings
- **Selection Rings**: Visual selection indicators for both tokens and groups

### Terminal Group System
- **TerminalGroup Component**: Unified React component that wraps ^ . ^ as single clickable units
- **State Management**: Separate `tokenStates` and `groupStates` hooks with `TokState` type (ok/maybe/bad)
- **GB State Mapping**: `bootstrapStatesFromGB()` maps GrammarBot categories to initial states
- **Unified Cycling**: Single click handler cycles entire groups while maintaining individual token control
- **Visual Synchronization**: All group members share colors, borders, and selection state
- **Non-Interactive Children**: Inner tokens made non-interactive with `pointer-events: none`
- **CSS Integration**: Comprehensive `.tg` styling with state-specific colors and borders
- **Accessibility**: Full keyboard navigation and ARIA support for groups

### GB State Mapping System (`src/lib/gb-map.ts`)

#### State Mapping Functions
- `bootstrapStatesFromGB()`: Initializes token and terminal group states from GrammarBot data
- **Category Mapping**: Maps GB error categories to initial UI states
  - `SPELL` → red (bad) on affected word tokens
  - `PUNC` → yellow (maybe) for terminal groups at boundaries  
  - `GRMR` → yellow (maybe) on word tokens
- **Terminal Group Creation**: Creates `TerminalGroupModel` objects for punctuation suggestions
- **End-of-Text Filtering**: Ignores PUNC insertions at final text position

#### Type Definitions
- `TokState`: Union type for token states ('ok' | 'maybe' | 'bad')
- `TerminalGroupModel`: Interface for terminal group data structure
- `GBEdit`: Interface matching GrammarBot edit structure

### Automated Validation
- **Spelling Detection**: GrammarBot-based spell checking
- **Grammar Rules**: Capitalization, terminal punctuation
- **Infraction Categories**: Definite vs. possible issues

### GrammarBot Integration (`src/lib/gbClient.ts`)

#### API Client
- `checkWithGrammarBot()`: Main function for grammar and spell checking
- **Professional Spell Checking**: Uses GrammarBot's neural API
- **Grammar Analysis**: Automatic grammar checking with debounced text analysis
- **Request Cancellation**: AbortSignal support for grammar checking requests
- **Rate Limiting**: Simple backoff handling for 429 responses

#### Virtual Terminal System (`src/lib/gbToVT.ts`)
- `gbEditsToInsertions()`: Converts GrammarBot edits to virtual terminal insertions
- **Terminal Punctuation Filtering**: Excludes punctuation insertions at end of text
- **Boundary Mapping**: Maps insertions to proper boundary indices
- **Smart Detection**: Identifies terminal punctuation suggestions (., !, ?)

#### Annotation System (`src/lib/gbAnnotate.ts`)
- `annotateFromGb()`: Annotates tokens with GrammarBot results
- `buildCaretRow()`: Builds caret states for boundary display
- `groupInsertionsByBoundary()`: Groups insertions by boundary index
- **Display Token Management**: Handles token styling and overlays
- **Caret State Management**: Manages ghost/active caret states

#### Paragraph Utilities (`src/lib/paragraphUtils.ts`)
- `charOffsetToBoundaryIndex()`: Converts character offset to boundary index
- `charOffsetToTokenIndex()`: Converts character offset to token index
- `newlineBoundarySet()`: Detects paragraph boundaries from newline characters
- `gbToVtInsertions()`: Converts GB edits to VT insertions, filtering end-of-text
- `withParagraphFallbackDots()`: Adds fallback periods at paragraph boundaries
- **Paragraph Detection**: Automatic recognition of carriage returns and line breaks
- **Smart Fallback**: Adds periods where GB didn't suggest punctuation at paragraph ends
- **Boundary Mapping**: Accurate character-to-boundary index conversion

### Export System (`src/lib/export.ts`)

#### Export Utilities
- `toCSV()`: Converts array of objects to CSV format with proper escaping
- `download()`: Client-side file download using Blob API
- **CSV Export**: Detailed audit data including boundary index, tokens, eligibility, validity, overrides
- **PDF Export**: Screenshots metrics panel with high-quality rendering (2x scale)

### Testing System (`tests/cws.spec.ts`)

#### Golden Tests
- **Vitest Integration**: Modern testing framework with UI and CLI modes
- **CWS Rule Validation**: Tests for initial-word credit, terminal capitalization, comma handling
- **Edge Cases**: Tests for quotes, parentheses, hyphens, apostrophes, and numerals
- **Behavior Locking**: Golden test ensures scoring behavior remains consistent
- **Pure Functions**: `src/lib/cws-core.ts` provides testable scoring functions
- **Continuous Integration**: Tests run automatically on build

### Debug System (`src/lib/utils.ts`)

#### Enhanced Debug Infrastructure
- **Multi-Method Activation**: Debug mode can be enabled via URL parameter (`?debug=1`), localStorage, environment variable, or browser console
- **Production-Safe**: Debug mode can be forced in production environments for troubleshooting
- **Persistent Storage**: URL-based activation persists across sessions via localStorage
- **Environment Support**: `NEXT_PUBLIC_CBM_DEBUG=1` for preview deploys and production debugging

#### Debug Functions
- **`dlog()`**: Conditional console logging that respects DEBUG flag
- **`dgroup()`**: Organized console grouping with try/finally cleanup
- **`dtable()`**: Structured table display for debugging data
- **Runtime Control**: Debug mode can be toggled at runtime via `window.__CBM_DEBUG__`

### API Routes (`src/app/api/`)

#### GrammarBot Proxy (`grammarbot/v1/check/route.ts`)
- Proxy endpoint to avoid CORS and rate limiting
- Passes through requests to GrammarBot API
- Returns grammar suggestions in standardized format

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
- GrammarBot API integration for professional spell checking
- Interactive UI with clickable carets and tokens
- Client-side only (no backend integration)
- Responsive design with mobile support

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

## Recent Updates

### Latest Improvements (v8.0) - Unified Terminal Group System & State Management
- **TerminalGroup Component**: Created `src/components/TerminalGroup.tsx` that wraps `^ . ^` as single clickable units with unified borders
- **GB State Mapping**: Implemented `src/lib/gb-map.ts` with `bootstrapStatesFromGB()` to map GB categories to initial states
  - `SPELL` → red (bad) on affected word tokens
  - `PUNC` → yellow (maybe) for terminal groups at boundaries
  - `GRMR` → yellow (maybe) on word tokens
- **State Cycling System**: Implemented green (ok) → yellow (maybe) → red (bad) → green (ok) cycling for both words and terminal groups
- **Unified State Management**: Added `tokenStates` and `groupStates` hooks with separate state tracking for tokens and groups
- **KPI Override System**: Updated `calcWSC()` and `calcCWS()` to respect current state overrides in real-time
- **Terminal Group Rendering**: Integrated TerminalGroup component into paragraph rendering with proper group detection
- **CSS Terminal Group Styles**: Added comprehensive `.tg`, `.tg--ok`, `.tg--maybe`, `.tg--bad` styling with proper color scheme
- **Non-Interactive Children**: Inner tokens (carets and dots) are made non-interactive with `pointer-events: none`
- **Paragraph Boundary Support**: Maintained existing paragraph handling with `.linebreak` styling for proper spacing
- **Type Safety**: Full TypeScript support with `TokState` and `TerminalGroupModel` types
- **Real-time Metrics**: KPI calculations now reflect user overrides immediately when states change

### Previous Improvements (v6.4) - Enhanced Punctuation Handling & Interactive UI
- **Terminal Punctuation Filtering**: Added filter in `gbToVT.ts` to exclude punctuation insertions at the very end of text (`e.start === text.length`)
- **Clean Visual Hierarchy**: Removed word highlighting for terminal groups - tokens maintain their original styling (spell/other only)
- **Yellow Dot Styling**: Replaced blue pill insertion styling with minimal yellow dots (`.insert-dot`) matching active caret color (`#f59e0b`)
- **Interactive Elements**: Made all carets and tokens clickable with full keyboard navigation support
- **Focus Management**: Added focus state system with visual feedback (yellow outline ring) for accessibility
- **Keyboard Navigation**: Arrow keys for navigation, Enter/Space for selection, proper ARIA labels and roles
- **Enhanced Accessibility**: Added `role="button"`, `tabIndex={0}`, and comprehensive keyboard event handling
- **CSS Improvements**: Added `.is-focused` class for accessibility focus indicators and updated insertion styling
- **User Experience**: Clickable interface allows users to interact with and navigate through carets and tokens
- **Visual Consistency**: Yellow insertion dots now match the active caret color for cohesive design

### Previous Improvements (v6.3) - GB Insertion Display System
- **GB Insertion Pills**: New blue pill system displays suggested punctuation insertions from GrammarBot
- **Synthetic Caret System**: Additional carets after each insertion create proper visual grouping (`^ . ^` pattern)
- **Boundary Grouping**: `groupInsertionsByBoundary()` function in `src/lib/gbAnnotate.ts` organizes insertions by boundary index
- **Interleaved Display**: Seamless integration with existing token and caret display system in `src/app/page.tsx`
- **End-of-Text Support**: Proper handling of final insertions at end-of-text boundary
- **Responsive Design**: Maintains flex-wrap behavior and accessibility features
- **CSS Enhancement**: Added `.pill-insert` and `.caret-sibling` styles to `src/app/globals.css`
- **Type Safety**: Full TypeScript support with proper type definitions for insertion cells
- **Test Coverage**: Comprehensive test suite in `__tests__/gb-insertions.test.ts` for boundary grouping functionality
- **Visual Pattern**: Shows `^ . ^` pattern for each suggested insertion with proper spacing
- **Accessibility**: Proper ARIA labels for screen readers and keyboard navigation

### Previous Improvements (v5.3) - N+1 Caret Boundary System
- **N+1 Caret Architecture**: Implemented proper boundary-based caret system with N+1 carets (one for each boundary including end-of-text)
- **Interleaved Grid Layout**: Carets now render as real grid cells between tokens instead of overlays, eliminating transform/positioning issues
- **Enhanced Boundary Mapping**: Updated `buildCaretRow()` to return `Array(tokens.length + 1)` for complete boundary coverage
- **End-of-Text Support**: Fixed `gbToVT.ts` to properly map end-of-text insertions to `tokens.length` boundary index
- **Visual Improvements**: Carets now sit in gaps between words with proper CSS styling (ghost: 25% opacity, active: yellow)
- **Grid-Based Rendering**: Single CSS grid with `gridAutoFlow: "column"` alternates caret/token cells for clean visual layout
- **Type Safety**: Added proper TypeScript types for `CaretState` and `Cell` union types
- **Debug Enhancement**: Console logging now shows correct caret count (N+1) and final boundary index for end-of-text insertions

### Future Enhancements
- Backend integration for data persistence
- Advanced grammar checking with POS tagging
- Multi-language support
- Enhanced export functionality
- Performance optimizations for large texts
- Web Worker implementation for non-blocking processing
