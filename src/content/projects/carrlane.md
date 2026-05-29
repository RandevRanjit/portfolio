---
title: CarrLane — Engineering Part Chatbot
tagline: LLM + function-calling retrieval pipeline over an engineering parts catalog, built during an AI/Software Engineering internship.
order: 12
buckets: [systems]
spokes:
  - { id: finance, role: secondary, blurb: "LLM function-calling retrieval pipeline built in industry — the one entry where the constraint was a real business catalog, not a personal project." }
stack: [Python, "LLM", "vector search", Node]
metrics:
  - { label: "Catalog", value: "10,000+ parts", source: "CV (Randev_Ranjit FPGA-Trading-CV)" }
  - { label: "LLM", value: "GPT-4o-mini + function-calling", source: "audit §websites (carrlane-chatbot: chat-server.js)" }
  - { label: "Dates", value: "Jun–Aug 2025, Chennai", source: "CV (AI / Software Engineering Intern)" }
role: AI / Software Engineering Intern. Built the LLM + function-calling retrieval pipeline over the engineering parts catalog; improved indexing and data quality for natural-language part selection.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/Carrlane-Chatbot" }
dates: "Jun–Aug 2025"
---

The one industry entry: an AI / Software Engineering internship at CarrLane Manufacturing (Chennai,
Jun–Aug 2025). Built a chatbot that lets engineers query a 10,000+ part catalog in natural language —
`gpt-4o-mini` with OpenAI function-calling driving a multi-turn tool loop to catalog-retrieval
functions (`functions.js`), orchestrated by a Node/Express backend with a Svelte frontend.

The technical work was in the retrieval layer: indexing the catalog correctly so the model gets
the right parts on the first tool call, and improving data quality so natural-language queries
map to the correct part numbers. The multi-turn tool loop handles disambiguation when the initial
query is underspecified.

Framed here as what it is — industry experience with a real catalog and real business constraints —
rather than a systems project. The engineering discipline (function-calling schema design, retrieval
precision, data quality) transfers to any domain with a structured lookup problem.
