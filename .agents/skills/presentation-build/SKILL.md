---
name: presentation-build
description: Build the static site and export presentations to PDF for the repo. Use when the user asks to build, check that the site compiles, export presentations to PDF, or verify a slide change without starting the dev server.
---

# Build en PDF-export

## Build

- `npm run build` runt `build:css` en daarna eleventy. Output: `_site/` (gitignored).
- Voor een controle zonder de repo-output te overschrijven: `npx eleventy --config=.eleventy.js --output=/tmp/site`. Verwijder `/tmp/site` daarna.
- Controleer dat een verwachte slide er is met `grep` op de gegenereerde HTML.

## PDF-export

- `npm run export` runt eerst de build en daarna `scripts/export-pdf.js`. Output: `output/`.
- Het script heeft geen argumenten en exporteert alle presentaties die het vindt. Het start zelf een statische server op `PORT` (standaard 8080).
- Gebruikt decktape/puppeteer. In containers of als root kan Chrome de sandbox niet starten. Zet dan `EXPORT_NO_SANDBOX=1`.

## Deploy

CI (`.github/workflows/main.yml`) bouwt bij een push naar `main` met `BASE_URL=/<repo-naam>` en publiceert `_site` naar de branch `gh-pages`. Lokaal hoeft niets gedeployd te worden.

## Gotchas

- Een nieuwe presentatie vraagt om `layout: presentation.njk`, `title`, `presentationDate`, en `theme` (`vlaanderen` of `omgeving`) in de frontmatter.
- Als je Claper-slides wijzigt, bouw dan opnieuw. De quiz-id's staan in de HTML (zie de `claper` skill).
