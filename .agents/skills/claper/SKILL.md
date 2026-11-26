---
name: claper
description: Manage live polls, quizzes and forms for the Claper presentation tool in this repo. Use when syncing claper-polls.json to Claper, opening or closing polls, activating quizzes or forms, reading live results, or debugging Claper 502 errors.
---

# Claper

Live vragen per presentatie. De bron van waarheid is `<jaar>/<presentatie>/claper-polls.json`. Het Claper-event heeft een code (bv. `q6tdq`) die in de JSON en in de slides staat.

## Token

- `CLAPER_CONTROL_TOKEN` staat in `.env` in de repo root (gitignored).
- Print of commit de token nooit. Controleer alleen of hij bestaat (`grep -c CLAPER_CONTROL_TOKEN .env`).

## Tools

Twee manieren, dezelfde backend:

1. **MCP-server** `scripts/claper-mcp.mjs` (geconfigureerd in `.mcp.json` en `opencode.json`). Tools:
   - `claper_status`: controleert public API en control API.
   - `claper_sync` (`file`): synct een polls-JSON naar Claper.
   - `claper_results` (`event`): live resultaten.
   - `claper_open` / `claper_close` (`event`, `kind`, `id`): poll, quiz of form activeren/deactiveren. `kind` is `poll`, `quiz` of `form`.
   - `claper_start` (`event`): start het event.
   - `claper_reactions` (`event`): reacties tellen.
2. **CLI**: `npm run claper:sync -- 2026/<presentatie>/claper-polls.json`

## Sync-workflow

1. Bewerk `claper-polls.json`. Elke poll, quiz en form krijgt een `id` zodra die bestaat in Claper.
2. Run de sync (`claper_sync` of de CLI).
3. Resultaat per item: `created`, `updated` of `kept`.
   - Een quiz met antwoorden wordt niet aangepast (`kept`).
   - Een optie verwijderen met stemmen geeft 409.
   - Opties matchen op positie. Een hernoemde optie behoudt zijn stemmen.
4. Nieuwe items krijgen een `id`. Zet die in de JSON, anders maakt de volgende sync een duplicaat.
5. Bouw de slides opnieuw (`npm run build`). De slides verwijzen naar quiz-id's (`data-claper-quiz="<id>"`).

## Gotchas

- **502 Bad Gateway bij aanmaken van een quiz**: vrijwel altijd te lange optietekst. De server heeft waarschijnlijk een kolomlimiet (~255 tekens, nog niet bevestigd). Houd opties kort en zet de volledige definitie op een slide. Dit gebeurde bij de quiz "Welk modelbegrip past bij de waterkwaliteitscasus?".
- **Quiz-titel is de sleutel** voor `2026/vc-event/vc-event.11tydata.js`. Hernoem de titel niet zonder de 11ty-data aan te passen.
- Controleer met `claper_results` wat er actief is voordat je opent of sluit.
- `GET /control/health` werkt niet via de proxy. Gebruik `claper_status`.
- **CORS-fout op `/control/start` in de browser**: de control-API staat origins toe uit `CLAPER_CONTROL_ORIGINS` (stack `configs/stacks/ovh/claper.yml` in de Servers-repo) plus alle `http://192.168.1.0–255` origins met optionele poort (sinds 2026-11-09, docker config `claper_control_v6`). Andere origins (bv. een publiek IP of een andere domein) krijgen geen toegang; de slides werken dan wel read-only. Oplossing: de origin in de lijst zetten (`docker service update --env-add CLAPER_CONTROL_ORIGINS=...`), of vanaf het LAN openen.

## Publieke read-only API

`https://claper.maximvdw.be/public-api/polls?event=eq.<code>&order=id` (anoniem). Velden van de quiz-view: `event, quiz, quiz_title, active, id, number, title, total, options, updated_at`.
