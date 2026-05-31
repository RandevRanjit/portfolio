---
title: ONI — Local-LLM Agent Harness
tagline: 79k-LOC single-crate Rust harness driving a local llama.cpp / MLX server through a 33-tool fenced-code protocol, a graph working-memory, and harness-managed compaction — with 2,151 tests and µs/ns Criterion latency contracts.
order: 7
section: other
buckets: [systems]
stack: [Rust, tokio, reqwest, criterion, llama.cpp, MLX]
metrics:
  - { label: "Codebase", value: "79.2k LOC Rust", source: "oni-preview: git ls-files '*.rs' | xargs wc -l" }
  - { label: "Tests", value: "2,151 tests", source: "oni-preview: grep -rn '#[test]|#[tokio::test]' src/" }
  - { label: "Parser budget", value: "<100 µs", source: "oni-preview: benches/parser.rs:8" }
  - { label: "Tool dispatch budget", value: "<5 ms/call", source: "oni-preview: benches/tools.rs:13" }
  - { label: "Loop-detector budget", value: "<50 ns/KB", source: "oni-preview: benches/lit.rs:6" }
  - { label: "Backends", value: "3 backends", source: "oni-preview: src/backend.rs:53" }
role: "Sole author. Designed and built the whole harness: the OMTF v0.4 fenced-code tool protocol and its 33-tool parser, the backend seam abstracting three inference servers, the graph working-memory with BFS gather and harness-managed compaction, the LIT/SIT stream-loop detectors, and the process-group SIGKILL sandbox. Every behaviour-changing feature is greenlit, rollback-tracked, and validated by scored A/B runs."
status: working
repo: { kind: private }
dates: "2026"
---

ONI is a from-scratch Rust harness for running a **local** coding agent — a single 79k-LOC crate that wraps a local `llama.cpp` / MLX inference server, hands the model one unified tool surface, and studies how far deliberate scaffolding can push a small quantised model's effective capability. It is a research rig, not a wrapper: the central rule is that no detector, recovery loop, or "smart" behaviour ships without an explicit green light and a scored experiment to justify it.

The active codebase (`oni-preview`) is a single binary, no workspace — a deliberate consolidation from an earlier 8-crate workspace (~68k LOC). All numbers below are measured against the current single-crate source.

## The tool protocol: OMTF v0.4

The model never sees a JSON tool-call API. It emits fenced code blocks, and a synchronous parser turns them into typed `ToolCall`s. OMTF v0.4 is an opener-clean, body-first grammar: the fence opener carries **the tool name and nothing else**; the body reads `[option lines] → target → [payload]`; multi-valued keys repeat the key rather than nesting. There are **33 fence types** — `bash` / `read` / `edit` / `write` / `grep` / `astgrep` / `patch` / `python` / `tmux` / `fetch` / `check` / `outline` / `filemap` and the rest — plus the always-on graph-memory family (`gather_context` / `compact_turn` / `update_importance` / `query_graph` / `hypothesize` / `resolve`).

The hard part isn't the happy path; it's that a quantised local model emits malformed fences constantly — unclosed `<think>` tags, truncated `write` bodies, native-XML tool calls from MiniMax, heredocs that swallow the closing fence. The parser is ~11k LOC across `parser/` (excluding tests) precisely because most of it is recovery: an XML-to-fence converter (`parser/xml.rs`, 3.3k LOC) that never silently drops an invoke, a rescue path for unclosed envelopes, and a loud `⚠ TRUNCATED WRITE` when a fence closes by EOF instead of ```` ``` ```` — because a silently truncated `write` corrupts a source file that only breaks the build several turns later. The parser is hot on every turn, so it carries a Criterion latency contract: **median < 100 µs across a 16-fixture stream corpus** that covers every real recovery path.

## Backend seam: one harness, three inference servers

`src/backend.rs` defines a `Backend` enum over three runtimes — **llama.cpp**, **MLX**, and **oMLX** (an MLX OpenAI-compatible server) — behind one trait that owns process lifecycle, token counting, and SSE-dialect differences. The default model is **MiniMax-M2.7 (UD-IQ4_NL)**; the preferred general model is **Qwen3.6-35B-A3B (UD-Q6_K_XL)** — a 35B MoE with 3B active at ~67 tok/s on an M4 Max.

The seam earns its keep. A measured decode-at-depth A/B found the MLX path holding **~1.34–1.88× the llama.cpp decode throughput, widening to ~1.85–1.88× at 150k context** — and, critically, oMLX's RAM→SSD prefix KV-cache restores per-turn re-prefill that llama.cpp's `--swa-full` forbids: **~97% saved per turn after the first** (a 50-turn deep run re-prefills in ~5 min on oMLX vs ~72 min on llama.cpp). A 12-prompt greedy quality smoke against the Q6 GGUF returned **12/12 byte-identical outputs**, so the speed win comes with no measurable quality loss. Every one of those claims is a number from a script in `runs/bench/`, not a vibe.

## Graph working-memory and harness-managed compaction

Context management is the real engineering. Instead of summarising old turns into prose, ONI keeps a typed **working-memory graph** (`src/memory/`, ~4k LOC): nine node types (Plan / Todo / Step / Observation / Error / Symbol / Decision / Fact / Hypothesis) and eight edge types (DependsOn / ProducedBy / Resolves / Supersedes / …), persisted to `./.oni-memory/graph.json`. Nodes are content-fingerprint-deduplicated — `add_node` keys an index on `(type, content)` so identical content collapses to one UUID. Each turn opens with a `gather_context` call that runs an **undirected BFS** from an anchor union (previous-turn anchors + keyword hits + all Plan nodes), bounded by hop depth, an importance floor, and a token budget, with pinned nodes (the live `todo` checklist) always surfacing even below the floor.

**Compaction** is a single harness-managed graph fold, triggered at **75–85% context fill** (configurable; MiniMax default `0.85`, Qwen configs `0.75`), and it runs in three deterministic stages:

1. **Backbone upsert (no LLM)** — the latest check/lint digests, the files-written exec-trace, the open hypothesis, and the best objective score so far are written into the graph as Fact/Observation nodes. This is the amnesia floor: state survives even if the next stage extracts nothing.
2. **One-shot LLM extraction** — the model is asked once to `compact_turn` its remaining state. An empty result is *accepted* — no retry, no block, no prose-summary fallback.
3. **Render + rebuild** — a pure function deterministically renders the graph slice and the raw history is discarded and rebuilt to a clean `[system, original-task, anchor, note]` array.

Because the rebuild constructs a fresh array rather than splicing the old one, it structurally **cannot emit a severed tool-role message** — which retired a whole class of jinja-500 crashes that the previous brute-truncation path produced under MiniMax. This is the design philosophy in microcosm: fix the failure mode at the structure level, not with a guard that patches the symptom.

## The process-group SIGKILL sandbox

The `bash` tool spawns `bash -c $cmd` in **its own process group** (`.process_group(0)`, `src/tools/bash.rs:184`). On timeout it doesn't just kill the direct child — it sends `SIGKILL` to the **whole group** via `kill(-pid, SIGKILL)` (`kill_group`, bash.rs:315). The reason is specific and was the motivating incident: a grandchild process (e.g. a piped `python3 … | cat`) holds the pipe write-end open after the parent bash dies, so the harness's `read_to_end` never sees EOF and the entire run hangs indefinitely. Group-kill is the only correct fix, and it's guarded by a regression test that forks exactly that grandchild and asserts the call returns within 8 seconds — if the hang regresses, the test fails.

## Latency as a contract, not an afterthought

Three Criterion benches encode the per-turn hot path as explicit budgets, and the physics behind each number is documented in the bench source: the parser at **< 100 µs/corpus** (so it never shows up in a session profile), tool dispatch at **< 5 ms/call** (imperceptible against ~22 ms/token inference), and the LIT loop detector at **< 50 ns per 1 KB SSE chunk** (it runs on every mid-stream chunk). **LIT** ("Loop Iteration Tracker", `src/text_loop_detector.rs`) is itself a small piece of real engineering: a channel state machine routes each SSE segment into a think-buffer or action-buffer, each keeps a rolling 2048-char (~512-token) window, and a **half-window trigram Jaccard** above 0.70 (think buffer) / 0.90 (action buffer) arms it; a shared counter then walks a Soft → Hard → Compact tier ladder. It is one of only two harness-side guardrails the project explicitly sanctions — and even then, action is always post-stream, never a mid-stream rewrite.

## What it isn't

ONI is a single-developer research harness, not a hosted product. It targets a specific machine (M4 Max, 128 GB) and a small set of local quants; many "capability" results are bounded by physics-hard eval checks the underlying model simply can't pass, and the project is honest about that — a passing harness lever is validated by a scored A/B, and "we observed X; this needs a different model" is an acceptable answer. The benchmark budgets are design targets tracked in source and checked in CI, not a published performance report. What it demonstrates is end-to-end systems ownership in Rust: a parser, a backend abstraction, a memory subsystem, process sandboxing, and streaming detectors, all under test and all under latency budget.
