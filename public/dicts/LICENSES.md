# Dictionary Licenses and Attributions

This directory contains Hunspell dictionary files used for spell checking functionality.

## Files

- `en_US.aff` - US English affix file (3.2 KB)
- `en_US.dic` - US English dictionary file (551 KB, ~49,568 words)

## Licenses and Attributions

### SCOWL (Spell Checker Oriented Word Lists)

The dictionary files are based on or derived from SCOWL (Spell Checker Oriented Word Lists) by Kevin Atkinson.

**License**: SCOWL is released under multiple licenses:
- The word lists are released under the LGPL (GNU Lesser General Public License)
- The affix files are released under the MPL (Mozilla Public License) 1.1

**Source**: http://wordlist.aspell.net/
**Author**: Kevin Atkinson
**Copyright**: Copyright (c) 2000-2019 by Kevin Atkinson

### Hunspell

The dictionary format follows the Hunspell specification.

**License**: Hunspell is released under multiple licenses:
- GPL (GNU General Public License) version 2 or later
- LGPL (GNU Lesser General Public License) version 2.1 or later
- MPL (Mozilla Public License) version 1.1 or later

**Source**: https://hunspell.github.io/
**Author**: László Németh
**Copyright**: Copyright (c) 2003-2019 by László Németh

### Dictionary File Details

The `en_US.aff` file includes:
- UTF-8 encoding support
- Apostrophe handling improvements (2024-01-29 by Marco A.G.Pinto)
- Standard US English affix rules

The `en_US.dic` file contains:
- Approximately 49,568 English words
- Standard US English spelling
- Common word variations and inflections

## Usage

These dictionary files are used by the Hunspell spell checking engine in this application to provide accurate spell checking for US English text. The files are loaded dynamically when the spell checker is initialized.

## Compliance

This application complies with the licensing requirements of both SCOWL and Hunspell by:
1. Including this attribution file
2. Maintaining the original license notices
3. Using the files only for spell checking functionality
4. Not modifying the core dictionary content beyond formatting

For questions about licensing or usage, please refer to the original SCOWL and Hunspell documentation and license terms.