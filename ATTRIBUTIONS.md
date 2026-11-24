# Attributions and licensing

## Country data

The country table in `src/countries.js` is independently compiled from factual country names and codes, with hand-curated display names, aliases, and ordering. The table (not the flag SVGs) is provided under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). No third-party country database, descriptions, or contact data are bundled.

Coverage was checked against the UN's [member states](https://www.un.org/en/about-us/member-states) and [non-member observer states](https://www.un.org/en/about-us/non-member-states). The 195-entry baseline is supplemented by Taiwan (`TW`) and Kosovo (`XK`, a user-assigned code, not an official ISO 3166-1 assignment). Inclusion defines the quiz's coverage, not a position on recognition. Aliases include familiar names and historical names for search, not as preferred display labels.

## Flag assets

The 197 SVGs in `assets/flags/` are the unmodified, variable-proportion illustrations from [hampusborgos/country-flags](https://github.com/hampusborgos/country-flags/tree/c09927e63705529bbf59ca6684cd9b23225dddad/svg). Upstream [credits Wikimedia Commons and identifies the flags as public domain](https://github.com/hampusborgos/country-flags/blob/c09927e63705529bbf59ca6684cd9b23225dddad/README.md). Other restrictions on use of official symbols may apply.

Snapshot archive SHA-256: `a0e028783137dba7e667b44366723e19dae50dbdfc0def2df653cf2e153cee9c`.

Only the 197 SVGs were extracted. The SVGs passed an XML allowlist audit for static SVG markup and local fragment references. No scripts, event handlers, external references, XML directives, or embedded personal metadata were found. The offline tests pin the audited SVG bytes with SHA-256.

## Scheduler

The browser bundle includes [ts-fsrs 5.4.2](https://www.npmjs.com/package/ts-fsrs/v/5.4.2), distributed under the [MIT license](LICENSES/ts-fsrs-MIT.txt).
