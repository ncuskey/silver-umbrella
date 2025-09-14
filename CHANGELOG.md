# Changelog

All notable changes to this project are documented here.
This project aims to follow Keep a Changelog and Semantic Versioning.

## Unreleased

- Added: Aggregated “Infractions & Suggestions” list. Identical GrammarBot infractions are grouped by tag + replacement and shown with counts (e.g., `10× PUNC → .`), sorted by most frequent.
- Changed: Updated default sample text in the “Paste student writing” box to the provided passage.
- Fixed: Netlify type error by adding optional `err_type` to `GBEdit` to align with `GbEdit`.
- Docs: Updated README and codemap to describe the new Infractions aggregation behavior.

- Added: Terminal groups now built from VT insertions derived from both INSERT PUNC and MODIFY replacements that contain sentence terminators (e.g., ". We").
- Added: End-of-text terminal support; final boundary groups render and are clickable.
- Changed: Capitalization at sentence start and clear word substitutions (e.g., go→went) are marked incorrect (red) instead of advisory.
- Chore: Debug log of VT boundaries behind `?debug=1`.
- Build: Set `outputFileTracingRoot` in `next.config.js` to avoid workspace root mis-detection in multi-lockfile environments.
- UI: Added rule tooltips on tokens (labels + replacements) and terminal tooltips on carets/dots; CSS pop‑in animation with slight hover delay for a polished feel.
- UI: Removed Spelling tab/page and tabs UI; app now focuses on Written Expression. Simplified control strip to only Time and color key. Updated main header text.
 - Fix: VT now recognizes PUNC INSERT replacements that include spaces (e.g., ". ") by extracting the first sentence terminator, ensuring terminal groups render for those cases.
