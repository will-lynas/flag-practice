# Attributions and licensing

## Country data

The country table in `src/countries.js` is independently compiled from factual country names and codes, with hand-curated display names, aliases, and ordering. The table (not the flag SVGs) is provided under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). No third-party country database, descriptions, or contact data are bundled.

Coverage was checked against the UN's [member states](https://www.un.org/en/about-us/member-states) and [non-member observer states](https://www.un.org/en/about-us/non-member-states). The 195-entry baseline is supplemented by Taiwan (`TW`) and Kosovo (`XK`, a user-assigned code, not an official ISO 3166-1 assignment). Inclusion defines the quiz's coverage, not a position on recognition. Aliases include familiar names and historical names for search, not as preferred display labels.

## Flag assets

The 197 SVGs in `assets/flags/` are unmodified 4:3 illustrations from [flag-icons v7.6.0](https://github.com/lipis/flag-icons/tree/6d6982dc20b2eb50967a343f05b60fbb81014e5f/flags/4x3), via the [npm release archive](https://registry.npmjs.org/flag-icons/-/flag-icons-7.6.0.tgz). Copyright (c) 2013 Panayiotis Lipiridis; [MIT license and notice](LICENSES/flag-icons-MIT.txt). Upstream [credits](https://github.com/lipis/flag-icons/blob/6d6982dc20b2eb50967a343f05b60fbb81014e5f/README.md#credits) acknowledge koppi's original SVG collection. Keep the MIT notice when redistributing the SVGs. The license covers the SVG files; restrictions on displaying or using official symbols may still apply. The standardized rendering can differ from each flag's official proportions.

Archive integrity (npm SHA-512 SRI): `sha512-hir/PsXwr0EESyizKrXJzmkzpLIMf+1vlNKLqAfvdh+bsU94a7LYWTiubkHKqptGoCPzOUGcm6c4PfC9/BaGSQ==`.

Only the 197 SVGs and the MIT notice were extracted. The SVGs passed an XML allowlist audit for static SVG markup and local fragment references. No scripts, event handlers, external references, XML directives, or embedded personal metadata were found. The offline tests pin the audited SVG bytes and MIT notice with SHA-256.

## Scheduler

The browser bundle includes [ts-fsrs 5.4.2](https://www.npmjs.com/package/ts-fsrs/v/5.4.2), distributed under the [MIT license](LICENSES/ts-fsrs-MIT.txt).
