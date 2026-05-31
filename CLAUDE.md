# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`FLOORPLAN/` is a small suite of **single-file React components** for a Greek (el-GR) construction
estimating / quoting workflow. The flow is: trace a floor plan → derive material & labour
quantities → assemble them into a priced offer document ("Τεύχος").

These are **Claude Artifact–style components**, not a buildable app. There is no `package.json`,
bundler, router, or test suite. Each `.jsx` file is a self-contained `export default` component that
runs inside a host providing React and a `window.storage` API. The two images at the repo root
(`2-Bedroom-Home-Plan-With-Dimensions.png`, `φλοορ2.jpg`) are sample floor plans for the takeoff tool.

## The Files (`front/`)

| File | Storage key | Role |
|------|-------------|------|
| `floor-plan-takeoff.jsx` | `takeoff-projects-v1` | Image upload → scale calibration → draw polygons/lines on a canvas → auto-derive quantities → export JSON. The only file that calls the network (Anthropic API). |
| `construction-offer-manager.jsx` | `offers-data` | Earliest, plainest offer editor (offers → sections → items). English-ish defaults. |
| `teuchos-builder.jsx` | `offers-app-v2` | Larger offer builder with templates. |
| `teuchos-builder-v3.jsx` | `teuchos-v3` | Current builder: prebuilt Greek construction templates (`TEMPLATES`), CSV import, print/preview, client-facing proposal output. |

`construction-offer-manager` → `teuchos-builder` → `teuchos-builder-v3` are **successive rewrites of
the same offer tool**, not a shared module hierarchy. They do not import each other and use different
storage keys, so they coexist without colliding. When improving "the builder," treat `teuchos-builder-v3.jsx`
as canonical unless told otherwise.

## The One Architectural Seam

The four files share **one data model** — this is the only real coupling:

```
offer → sections[] → items[] = { description, quantity, unit, unitPrice }
```

`floor-plan-takeoff.exportJSON()` emits `{ exportType, calibration, sections:[{name, items:[...]}], rawMeasurements }`
where each item is `{ description, quantity, unit, unitPrice }` — deliberately the **exact section/item
shape the builders consume**. That is the integration: takeoff exports JSON, a builder imports those
sections. There is no live/in-memory handoff between components; they communicate only via this JSON
shape (and CSV import in v3). Keep the item shape stable across both sides when editing either end.

## Conventions Every File Follows

- **Persistence is `window.storage`, not `localStorage`.** Async API: `await window.storage.get(KEY)`
  returns `{ value }` (a JSON string you must `JSON.parse`); `await window.storage.set(KEY, JSON.stringify(...))`.
  Saves are **debounced** (~600ms) via a `useRef` timeout. Each file owns a distinct `STORAGE_KEY`
  declared at the top — never reuse another file's key.
- **IDs**: local `uid()` = `Date.now().toString(36) + Math.random().toString(36).slice(2,…)`. No UUID lib.
- **Greek domain + locale.** UI strings, item descriptions, and templates are in Greek. Numbers/currency
  use `Intl.NumberFormat("el-GR", …)` via local `fmt`/`fmtNum` helpers. Units are metric (`m`, `m²`, `m³`, `kg`).
  "Τεύχος" = the construction tender/offer booklet.
- **Styling is inline.** Style objects (commonly `S` or `B`) plus an injected `<style>` tag for
  `:hover`/`:focus`/`@media print`. No CSS files, no Tailwind, no UI library.
- **Icons** are hand-rolled inline SVG `<path>` components (see `construction-offer-manager.jsx`),
  not an icon package.

## Floor-Plan Takeoff Specifics

- **Layers** (`DEFAULT_LAYERS`) carry a `calcType` of `"area"` (polygons → m²) or `"line"` (polylines → m).
  Wall area = length × `wallHeight` (default 2.80m; WC tiling height 2.40m). Shared edges between
  adjacent rooms are detected by proximity (`SNAP_DIST` px) and reclassified as internal walls.
- **AI room detection** (`floor-plan-takeoff.jsx`, ~line 273) `fetch`es `https://api.anthropic.com/v1/messages`
  with `model: "claude-sonnet-4-20250514"`, sending a downscaled (1024px) base64 image and asking for a
  bare JSON array of rooms with pixel coords; coords are scaled back up by `1/resized.scale`. The host is
  expected to supply auth/CORS for this call — there is no API key in the code. If you touch this, keep
  the "return ONLY a JSON array, no markdown" contract and the lenient parse fallback (regex-extract `[…]`).

## Working In This Repo

- **No build/lint/test commands exist.** To preview a component, run it in a host that provides React +
  `window.storage` (e.g. the Claude artifact runtime it was authored in). Don't add a toolchain unless asked.
- This directory is **untracked** within the parent `AGENTI_SDK` git repo (the repo root is two levels up at
  `AGENTI_SDK/`, whose `CLAUDE.md` describes the unrelated AgelClaw project). Scope work here to `FLOORPLAN/`.
- When editing a component, preserve its self-contained nature: single default export, no new external
  dependencies, no cross-file imports.

## Conversation Logging (standing instruction)

Record every conversation, and **update the record at each checkpoint** (after each meaningful step),
to **two mirrored destinations**:

1. **Local SQLite** — `back/claude.db`, via `back/conversation_log.py`:
   ```
   python back/conversation_log.py upsert --session <stable-id> --title "..." --summary "..." \
       --key-decisions "..." --action-items "..." --status "In Progress" \
       --type Development --project Construction --device "🖥️ Desktop Σπίτι" \
       --notion-url "<url from step 2>"
   ```
2. **Notion** — the "📝 Claude Conversations" database (data source
   `cd521f39-b784-426d-8a73-2a7f35391d65`) via the Notion MCP. Create the page once per conversation,
   then `update-page` it on later checkpoints.

Rules:
- **One row per conversation** (keyed by `--session`), updated in place — never a new row per checkpoint.
- Keep both mirrors in sync: store the Notion page URL back into `claude.db` with `--notion-url`.
- Schema fields match the Notion DB: Title, Summary, Action Items, Key Decisions, Status
  (`Completed`/`In Progress`/`Follow Up Needed`/`Reference`), Project (multi), Type, Device/Source, Date.
- `claude.db` is **gitignored** — these logs must never reach the public repo.

## Commits

- This repo's remote is **public** (`github.com/sdrakos/floorplan`).
- **Author/sign commits as `sdrakos`. Never add a `Co-Authored-By` line.**
- Never commit `.env`, `.Claude/`, model weights, or `claude.db` (all gitignored — keep it that way).
