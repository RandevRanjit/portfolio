---
title: CarrLane — Engineering Part Catalog Chatbot
tagline: Three-tier function-calling assistant that turns natural-language part queries into typed API calls over a scraped engineering catalog — built during an industry internship.
order: 12
section: other
buckets: [systems]
stack: [Python, FastAPI, SQLModel, "Node/Express", React, "Chakra UI", "OpenAI function-calling", BeautifulSoup, SQLite]
metrics:
  - { label: "Catalog (prototype)", value: "314 parts", source: "carrlane: backend/data/alignment_pins.json (314 part_no records)" }
  - { label: "Company catalog", value: "10,000+ parts", source: "CV (Randev_Ranjit FPGA-Trading-CV)" }
  - { label: "LLM tools", value: "9 typed function schemas", source: "carrlane: orchestrator/functions.js:4-112" }
  - { label: "API tests", value: "8 async endpoint tests", source: "carrlane: backend/test/test_api.py" }
  - { label: "Dates", value: "Jun–Aug 2025, Chennai", source: "CV (AI / Software Engineering Intern)" }
role: AI / Software Engineering Intern. Built the catalog ingestion, the typed REST API over it, and the function-calling orchestration layer that maps natural-language queries to catalog lookups.
status: working
repo: { kind: private }
dates: "Jun–Aug 2025"
---

The one industry entry: an AI / Software Engineering internship at CarrLane Manufacturing (Chennai, Jun–Aug 2025).
The product is a chatbot that lets an engineer ask for a part in plain English — "what's the largest L-pin diameter you stock?" — and get the right part number back, grounded in the actual catalog rather than the model's training data.

The interesting engineering is not the chat UI. It's the **three-tier separation** that keeps the model from ever inventing a part.

## Architecture: model on top, deterministic data underneath

```
React + Chakra UI  →  Node/Express orchestrator  →  FastAPI catalog service  →  SQLite
  (chat client)        (gpt-4o-mini, 9 tools)         (typed REST, SQLModel)
```

Three processes, three responsibilities:

- **FastAPI catalog service** (`backend/`) — the source of truth. SQLModel ORM over SQLite, exposing a hierarchy of `segment → product line → product type → part`. Every part's specs live in a JSON column, and every lookup is a real query, not a prompt.
- **Node/Express orchestrator** (`orchestrator/chat-server.js`) — the only thing that talks to OpenAI. It declares **nine typed function schemas** to `gpt-4o-mini` and runs the function-call → execute → synthesize round.
- **React frontend** (`frontend/`) — Chakra UI chat client with optimistic updates and a live AI-status badge (`sending → thinking → calling → rendering`; hidden when idle). The committed catalog data is `react-markdown`-rendered.

The design rule was: **the model decides *what* to fetch; the API decides *what exists*.** The LLM never sees the database — it only sees function results. If a part isn't in SQLite, the model cannot return it, because there's no path for it to.

## The function-calling round, exactly as built

`chat-server.js` runs a deliberate single round of tool use, not an open-ended agent loop:

1. Sanitize the chat history (drop any message without string content — `gpt-4o-mini` rejects null-content function turns).
2. First completion with `function_call: "auto"` over the 9 schemas.
3. If the model picked a function, execute it against the FastAPI service, append the `assistant` function-call turn and the `function` result turn, then make a **second** completion to turn raw JSON into a sentence.
4. If no function was picked, return the text directly.

I chose a fixed round over a recursive agent loop on purpose: the catalog is shallow and the failure mode of looping LLMs (runaway tool calls, cost blow-ups) wasn't worth it for a lookup problem. Where genuine chaining *is* needed — "what's the max bushing diameter in this type" — the chaining happens **server-side, deterministically**: `getSpecStats` calls the catalog's own functions to resolve names, pull the parts, and compute min/max in code, so the arithmetic is never left to the model.

## Exposing a hierarchical catalog as a flat tool set

The nine schemas (`orchestrator/functions.js`) are the real design work. The catalog is a tree, but function-calling wants flat, typed parameters. So the tools span the whole tree at different granularities — `fetchCatalog`, `fetchProductLines`, `fetchTypesForLine`, `fetchParts`, `fetchPart`, `getSpecStats` and friends — each with a JSON-Schema parameter contract the model has to satisfy.

The model speaks in **human titles** ("L Pins T Pins And Jig Pins"); the API speaks in **integer IDs**. Bridging that is a normalization layer: `normalize(s) = s.toLowerCase().replace(/[^a-z0-9]/g, "")`, used to match the model's loose title against the canonical one and resolve it to an ID before hitting the API. When the model only gives a product *type* and omits its parent line, `resolveTypeIdByName` walks every line's types to auto-discover the parent. That's plain string matching and ID resolution — **there is no vector search or embedding store** anywhere in this system, and the entry shouldn't pretend otherwise. The grounding comes from the typed API, not from similarity.

## The data quality problem was the actual problem

The catalog was scraped from carrlane.com with BeautifulSoup (`scraper/data_ingestion/scraper.py`), parsing the spec tables out of the live product pages. Real engineering data is hostile to numeric comparison:

- **Imperial fractions as strings.** Dimensions come through as `"3/16"`, `"2-1/2"`, `".1875"`. The committed prototype has **1,634** such fractional spec values. You cannot `min`/`max` those as text. `parse_spec_value` (`backend/app/crud.py`) parses simple fractions like `"3/16"` through Python's `Fraction` so aggregation works for them. Mixed-number values like `"2-1/2"` are not handled (the code attempts `replace('-', ' ')` to get `"2 1/2"` but `Fraction` rejects that form, so they silently return `None` and are excluded from aggregation).
- **Inconsistent spec keys.** The same physical dimension shows up as `"A DIA NOMINAL"`, `"A DIA NOMINAL (mm)"`, `"A DIA ACTUAL +0/-.0010"` across types. The scraper tooling (`scraper/output/add_alias.py`) and the JSON catalog store a per-type alias array mapping friendly names to real spec keys, but the `getSpecStats` orchestrator function looks for them in a tab titled `"alias"` within the product type's `info` array (no such tab exists in the scraped data — the actual tabs are `"Product Information"`, `"Application Information"`, `"Material"`, etc.), so the alias resolution is currently a dead branch — `specKey` passes through unchanged.

This is the unglamorous part that makes the answer correct instead of plausible.

## What's proven vs. assumed

The FastAPI layer has **8 async endpoint tests** (`backend/test/test_api.py`, httpx + ASGI transport) covering segment/line/type/part lookups, spec filtering, and min/max aggregation — including the 404 paths for unknown names. The catalog correctness is therefore tested, not asserted. The orchestrator's LLM round is *not* unit-tested (a Jest harness is declared but no spec files exist) — that's a real gap, honestly noted.

## Honest scope

The working prototype covers **one** product line — *L Pins, T Pins and Jig Pins* — which is **314 parts across 11 product types**, scraped end-to-end into SQLite. The "10,000+ parts" figure is CarrLane's full company catalog (from the CV), not what this prototype ingests; the system is built to scale to it (the scraper and schema are line-agnostic), but the committed dataset is the one product line. Calling that out matters more than rounding up.

The transferable skill is the pattern, not the domain: when you put an LLM in front of structured data, the win is the **typed boundary** between the model and the source of truth — typed tool schemas, deterministic resolution, and the hard data-cleaning underneath. That generalizes to any structured-lookup problem, a trading instrument table as readily as a parts catalog.
