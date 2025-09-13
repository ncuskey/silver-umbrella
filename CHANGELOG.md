# Changelog

All notable changes to this project are documented here.
This project aims to follow Keep a Changelog and Semantic Versioning.

## Unreleased

- Added: Aggregated “Infractions & Suggestions” list. Identical GrammarBot infractions are grouped by tag + replacement and shown with counts (e.g., `10× PUNC → .`), sorted by most frequent.
- Changed: Updated default sample text in the “Paste student writing” box to the provided passage.
- Fixed: Netlify type error by adding optional `err_type` to `GBEdit` to align with `GbEdit`.
- Docs: Updated README and codemap to describe the new Infractions aggregation behavior.

