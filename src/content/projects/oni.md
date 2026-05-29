---
title: ONI — Rust LLM Agent Harness
tagline: 78k LOC single-crate Rust research harness — parser/exec separation, graph working-memory, criterion µs/ns benchmarks, process-group SIGKILL sandbox.
order: 7
buckets: [systems]
spokes:
  - { id: finance, role: secondary, blurb: "Systems Rust at scale: tokio async, process isolation, µs-latency targets — the same discipline as low-latency infra." }
  - { id: drone, role: secondary, blurb: "Production-incident-driven engineering: graph memory, context compaction, and a process-group kill that came from a real 45-min hang." }
stack: [Rust, tokio, criterion]
metrics:
  - { label: "Codebase", value: "78,176 LOC Rust", source: "audit §oni-preview (git ls-files wc -l)" }
  - { label: "Parser target", value: "< 100 µs / 15-sample corpus", source: "audit §oni-preview (benches/parser.rs:8-9)" }
  - { label: "Dispatch target", value: "< 5 ms / dispatch", source: "audit §oni-preview (benches/tools.rs:13)" }
  - { label: "LIT detector target", value: "< 50 ns / 1 KB chunk", source: "audit §oni-preview (benches/lit.rs:6)" }
role: "Sole author. Built the parser/exec separation, graph working-memory (UUIDv4 nodes, BFS gather, compaction), three Criterion bench targets, and the process-group SIGKILL sandboxing. Production-incident-driven — the kill pattern came from a real git-clone hang in a remote-benchmark run."
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/ONI" }
dates: "2026"
---

A from-scratch Rust multi-agent coding harness — 78k LOC in a single crate, built for running a
local llama-server with a structured tool surface, graph-based working memory, and systematic
benchmarking of model behaviour under scaffolding.

**Parser/exec separation with capability gating.** The Criterion bench targets make the latency
contract explicit: parser median <100 µs on a 15-fixture corpus, tool dispatch <5 ms, LIT
detector <50 ns/KB amortised. These are design targets tracked in source, not post-hoc measurements.

**Graph working-memory.** Mandatory working-memory graph (Plan/Todo/Step/Observation/Error/Symbol/
Decision/Fact/Hypothesis nodes; DependsOn/ProducedBy/Resolves/… edges). Backed by `graph.json`;
BFS gather with hop depth + importance floor + token budget. UUIDv4 IDs, content-fingerprint dedup.
**Compaction** at 75% context fill: deterministic backbone upsert (check/lint digests, exec-trace
observations) without LLM, then one-shot LLM extraction, then raw-history discard → canonical
`[system, task, anchor, note]` shape.

**Process-group SIGKILL sandboxing** (`src/tools/bash.rs:182–319`). Spawns child bash with
`.process_group(0)`, then on timeout kills the entire group via `kill(-(pid), SIGKILL)`. Triggered
by a real incident: a `git clone` prompting for `Username for…` caused a 45-minute hang in a
TB2 benchmark run — the prior single-child kill left the prompt alive.

The ONI public repo (`SparkleButt747/ONI`) is ~5 weeks behind `oni-preview`; this entry covers
the active branch. The oldest codebase in this portfolio at the systems level — it shows the
iteration from a Python prototype through a full Rust rewrite, with documented divergences.
