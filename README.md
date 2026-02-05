# Reveal.js Presentaties

Reveal.js presentaties met Nunjucks templates en Eleventy static site generator in Vlaamse overheid huisstijl.

## Installatie

```bash
npm install
```

## Gebruik

### Ontwikkelen

Start de development server met hot reload:

```bash
npm start
```

Presentaties zijn beschikbaar op http://localhost:8080

### Nieuwe presentatie aanmaken

Maak een nieuwe directory met hiërarchische structuur (bijv. `jaar/topic/`) en voeg een bestand toe:

#### Optie 1: Markdown (`.md`)

Voor eenvoudige presentaties met Markdown syntax:

```markdown
---
layout: presentation.njk
title: Mijn Presentatie Titel
subtitle: Optionele ondertitel
presentationDate: 4 februari 2026
---

## Eerste Slide

Inhoud in **Markdown**!

- Lijsten
- *Italic* en **bold**
- `Code`

---

## Tweede Slide

```javascript
const code = "werkt ook";
```

---

## Mermaid Diagram

<div class="mermaid">
graph LR
    A[Start] --> B[Einde]
</div>
```

**Note:** Slides scheiden met `---`. HTML kan gebruikt worden voor custom elementen.

#### Optie 2: Nunjucks (`.njk`)

Voor complexere presentaties met volledige HTML controle:

```nunjucks
---
layout: presentation.njk
title: Mijn Presentatie Titel
subtitle: Optionele ondertitel
presentationDate: 4 februari 2026
---

<section>
  <h2>Eerste Slide</h2>
  <p>Inhoud hier...</p>
</section>

<section>
  <h2>Tweede Slide</h2>
  <ul>
    <li>Punt 1</li>
    <li>Punt 2</li>
  </ul>
</section>

<section>
  <h2>Mermaid Diagram</h2>
  <div class="mermaid">
graph TD
    A[Start] --> B{Beslissing}
    B -->|Ja| C[Actie 1]
    B -->|Nee| D[Actie 2]
  </div>
</section>
```

### Mermaid Diagrammen

Mermaid wordt automatisch ondersteund. Gebruik `<div class="mermaid">` voor diagrammen:

**Flowchart:**
```html
<div class="mermaid">
graph TD
    A[Start] --> B[Einde]
</div>
```

**Sequence Diagram:**
```html
<div class="mermaid">
sequenceDiagram
    Client->>Server: Request
    Server-->>Client: Response
</div>
```

**Andere types:** Class diagrams, State diagrams, ER diagrams, Gantt charts, etc.

### Default configuratie

De volgende waarden worden automatisch ingevuld vanuit `_data/defaults.json`:
- **author**: Maxim Van de Wynckel
- **organization**: Departement Omgeving
- **theme**: vlaanderen
- **logo-icoon**: automatisch `vl-vi-vlaanderen` linksonder op elke slide

Je kan deze overschrijven in de frontmatter van je presentatie.

### Themes

#### Vlaanderen (standaard)

Standaard Vlaamse overheid huisstijl met geel en blauw.

```yaml
theme: vlaanderen
```

#### Omgeving

Departement Omgeving branding met groene accent kleur (#447a6d).

```yaml
theme: omgeving
```

Pas de volgende frontmatter velden aan:
```yaml
theme: omgeving
organization: Departement Omgeving
```

### Bouwen

Bouw de statische site:

```bash
npm run build
```

### Exporteren naar PDF

1. Start de development server: `npm start`
2. In een nieuwe terminal: `npm run export`

**Vereist:** [decktape](https://github.com/astefanutti/decktape)

```bash
npm install -g decktape
```

PDF bestanden worden opgeslagen in de `output/` directory.

## Reveal.js Features

- Navigatie met pijltjestoetsen of swipe gestures
- Overview mode: druk op `ESC` of `O`
- Speaker notes: druk op `S`
- Fullscreen: druk op `F`
- Zoeken: druk op `CTRL+SHIFT+F`
- Print naar PDF: voeg `?print-pdf` toe aan de URL

## Licentie

MIT
