---
name: create-presentation
description: Use when the user asks to "create a presentation", "build a deck", "make slides", or wants to produce an HTML slide deck. Guides the creation of on-brand Betashares HTML presentations with composable modules and diagrams.
version: 1.0.0
---

# Create Presentation

Build a Betashares-branded HTML presentation from a JSON slide definition. Output is a self-contained single `.html` file with embedded fonts, logos, and inline SVG diagrams.

## Workflow

1. **Gather requirements** -- ask the user for: topic, audience, purpose, approximate slide count, and any specific data/diagrams needed.
2. **Draft a slide plan** -- propose the slide order and titles. Show the user and get approval before writing JSON.
3. **Write the JSON spec** -- create a `.json` file following the schema below. Save it to `/tmp/<slug>-deck.json`.
4. **Build** -- run `node templates/presentation/build.js /tmp/<slug>-deck.json` from the repo root.
5. **Open in browser** -- open the output at `docs/Decks/<filename>.html` so the user can review.
6. **Iterate** -- if the user wants changes, edit the JSON and rebuild.

## JSON Structure

```json
{
  "meta": {
    "title": "Deck title (shown in browser tab)",
    "filename": "output-filename (no extension)",
    "author": "Presenter name",
    "date": "YYYY-MM-DD"
  },
  "slides": [ ... ]
}
```

## Slide Definition

Every slide has these common fields:

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique HTML id (e.g. `"cover"`, `"kpi-stats"`) |
| `type` | yes | One of: `hero`, `content`, `invert`, `section` |
| `chapter` | no | Chapter heading in side nav (groups slides) |
| `nav` | no | Short label for the nav link (falls back to `title`) |
| `eyebrow` | no | Mono uppercase label above the title |
| `title` | no | Slide heading |
| `subtitle` | no | Body text below the title |
| `byline` | no | Array of strings shown on hero slides |
| `columns` | no | Set to `2` for two-column layout |
| `modules` | no | Array of content modules (see below) |

### Slide Types

- **`hero`** -- dark background, Betashares wordmark top-left. Use for cover and closing.
- **`content`** -- ivory background with a white card. Most slides use this.
- **`invert`** -- dark background, white text. Good for decision points or emphasis.
- **`section`** -- ivory background, centred text. Use as chapter dividers.

## Content Modules

Each module in the `modules` array has `{ "type": "...", "data": { ... } }`.

### Data & Layout Modules

| Type | Data Fields |
|---|---|
| `stat-grid` | `columns` (int), `items` (array of `{ label, value, delta, deltaDir }`) |
| `ship-list` | `items` (array of `{ title, desc, ref }`) |
| `progress-list` | `items` (array of `{ title, pct, desc }`) |
| `comparison-cards` | `cards` (array of `{ title, points[], highlighted }`) |
| `feature-rows` | `items` (array of `{ title, desc, icon? }`) |
| `decision-card` | `question`, `context`, `options` (array of `{ label, preferred }`) |
| `data-table` | `columns[]`, `rows[][]` (cells can be string or `{ value, type: "positive"|"negative" }`) |
| `timeline` | `milestones` (array of `{ date, title, desc, done, tags[] }`) |
| `callout-box` | `heading`, `body` |
| `icon-cards` | `cards` (array of `{ title, desc, icon? }`) |

### Image Modules

| Type | Data Fields |
|---|---|
| `image-full` | `src`, `alt`, `caption` |
| `image-captioned` | `src`, `alt`, `title`, `desc` |
| `image-split` | `src`, `alt`, `heading`, `body`, `imagePosition` ("left"/"right"), `ratio` ("60-40") |
| `image-grid` | `columns` (2 or 3), `images` (array of `{ src, alt, label }`) |
| `image-strip` | `images` (array of `{ src, alt }`) |

### Diagram Modules

All diagram modules use `{ "type": "diagram-<name>", "data": { ... } }`.

| Type | Data Fields |
|---|---|
| `diagram-flow` | `direction` ("lr"/"tb"), `nodes` (`{ id, label, shape, highlight }`), `edges` (`{ from, to, label }`) |
| `diagram-architecture` | `groups` (`{ label, components: [{ id, title, desc, style }] }`), `connections` (`{ from, to, style, label }`) |
| `diagram-comparison` | `headers` (2 strings), `rows` (`{ label, left, right }` -- booleans) |
| `diagram-timeline-hz` | `phases` (`{ date, label, status }` -- status: done/active/future) |
| `diagram-entity` | `entities` (`{ id, title, style, attributes[] }`), `relationships` (`{ from, to, label, desc }`), `clusters` |
| `diagram-funnel` | `stages` (`{ label, value, colour? }`), `showConversion` (bool) |
| `diagram-sparkline` | `points[]`, `colour`, `showArea`, `showEndDot`, `width`, `height` |
| `diagram-bar` | `orientation`, `variant` ("grouped"/"stacked"), `categories[]`, `series` (`{ label, values[], colour }`), `showValues`, `unit` |
| `diagram-dashboard` | `columns` (2-4), `widgets` (array of stat/sparkline/bar widgets) |

## Rules

- Always start with a `hero` slide (cover) and end with another `hero` (closing).
- Use `section` slides to separate logical chapters.
- Set `chapter` on every slide for proper side nav grouping.
- Set `nav` for concise navigation labels.
- Keep content slides focused: one idea per slide.
- Use UK English spelling.
- `deltaDir` values: `"up"` (green), `"down"` (red), `"flat"` (grey).
- Image `src` can be absolute file paths (embedded as base64) or data URIs.
- For `diagram-bar` series, set `colour` to a hex value. Portfolio colours available: `#927369` (Conservative), `#c97c64` (Moderate), `#fc4d16` (Balanced), `#db3300` (Growth), `#bb0505` (High Growth), `#750000` (All Growth), `#2e9c25` (Responsible), `#333d9a` (Technology), `#d47f00` (Income), `#4a555d` (Geared).

## Example Slide

```json
{
  "id": "q1-kpis",
  "type": "content",
  "chapter": "Performance",
  "nav": "KPIs",
  "eyebrow": "Q1 2026",
  "title": "Key metrics",
  "modules": [
    {
      "type": "stat-grid",
      "data": {
        "columns": 3,
        "items": [
          { "label": "AUM", "value": "$4.2B", "delta": "+12% YoY", "deltaDir": "up" },
          { "label": "NPS", "value": "72", "delta": "Flat", "deltaDir": "flat" },
          { "label": "Accounts", "value": "28,400", "delta": "+8%", "deltaDir": "up" }
        ]
      }
    }
  ]
}
```
