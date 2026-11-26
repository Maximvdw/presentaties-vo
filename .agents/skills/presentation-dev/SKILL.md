---
name: presentation-dev
description: Start, verify and stop the local Eleventy dev server for the presentations in this repo. Use when the user wants to preview or run a presentation locally, or to stop a running preview.
---

# Presentation dev server

## Starten

`npm start` runt `build:css` en daarna `eleventy --serve`. De server blijft draaien, dus start hem als achtergrondproces (async, geen blokkerende shell).

1. Start: `npm start` (async). Standaardpoort is 8088. Andere poort: `PORT=<poort> npm start`. Kies geen 8080 of 8081, die zijn vaak bezet.
2. Verifieer: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8088/` moet `200` geven.

**Let op:** een `200` kan van een andere app komen. Controleer dat de log `Server at http://localhost:<poort>/` toont met jouw poort. Controleer vóór het starten met `ss -ltn | grep :<poort>` of de poort vrij is.

## Stoppen

- Stop alleen het proces dat je zelf startte, met een specifiek PID (`kill <pid>`). Gebruik geen `pkill` of `killall`.
- Zoek het PID met `ss -ltnp | grep :<poort>` en controleer met `readlink /proc/<pid>/fd/1` of het jouw logbestand is.
- Het proces is een `sh -c npm run build:css && eleventy --serve` met een `eleventy`-kind. Stop de hele keten (sh + eleventy).
- Verifieer dat de poort dicht is: `curl` moet `000` geven.

## Output

De dev-server schrijft naar `_site/`. Die map is gitignored, dus er is niets op te ruimen.
