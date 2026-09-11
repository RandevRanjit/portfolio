---
title: ONI — Local-LLM Agent Harness
tagline: 102k-LOC single-crate Rust harness driving a local llama.cpp / MLX server through a 38-tool fenced-code protocol, a graph working-memory, a tree-sitter code graph and an in-loop LSP client — 2,656 tests, µs/ns Criterion latency contracts, and a scored experiment behind every feature that shipped.
order: 7
section: other
buckets: [systems]
stack: [Rust, tokio, reqwest, tree-sitter, tantivy, criterion, llama.cpp, MLX]
metrics:
  - { label: "Codebase", value: "102.1k LOC Rust", source: "oni/preview: git ls-files '*.rs' | xargs wc -l → 102,091 (2026-09-11)" }
  - { label: "Tests", value: "2,656 tests", source: "oni/preview: grep -rE '#[test]|#[tokio::test]' src/ tests/ (2026-09-11)" }
  - { label: "Tool surface", value: "38 fenced tools", source: "oni/preview: src/parser/registry.rs:14 (TOOL_NAMES, 38 entries) (2026-09-11)" }
  - { label: "Parser budget", value: "<100 µs", source: "oni/preview: benches/parser.rs:8, 16 stream fixtures (2026-09-11)" }
  - { label: "Tool dispatch budget", value: "<5 ms/call", source: "oni/preview: benches/tools.rs:13 (2026-09-11)" }
  - { label: "Loop-detector budget", value: "<50 ns/KB", source: "oni/preview: benches/lit.rs:6 (2026-09-11)" }
  - { label: "Backends", value: "3 backends", source: "oni/preview: src/backend.rs:53-57 (llamacpp / mlx / omlx) (2026-09-11)" }
  - { label: "Best scored eval run", value: "9/9 on L1, ×9", source: "oni/preview: docs/research/GROUND_TRUTH.md §9 — nine on-disk 9/9 L1 runs (2026-09-11)" }
role: "Sole author. Designed and built the whole harness: the OMTF v0.4 fenced-code tool protocol and the parser that normalises three native XML dialects into it, the backend seam over three inference servers, the graph working-memory with BFS gather and harness-managed compaction, a tree-sitter code knowledge-graph, an in-loop LSP diagnostics client, the LIT/SIT stream-loop detectors, the two-role delegate orchestrator, and the process-group SIGKILL sandbox. Every behaviour-changing feature is greenlit, rollback-tracked, and either validated or killed by a scored run."
status: working
repo: { kind: private }
dates: "2026"
---

ONI is a from-scratch Rust harness for running a **local** coding agent: a single 102k-LOC crate that wraps a local `llama.cpp` / MLX inference server, hands the model one unified tool surface, and studies how far deliberate scaffolding can push a small quantised model's effective capability. It is a research rig, not a wrapper. The central rule: no detector, recovery loop, or "smart" behaviour ships without an explicit green light and a scored experiment to justify it — and several of the levers below were scored, refuted, and either ripped out or demoted.

`~/Projects/oni` now holds three sibling code-bases, not a fork chain. **`core`** is the original ONI — an 8-crate Cargo workspace with a ratatui TUI, multi-agent orchestration and SQLite persistence (68,011 LOC of Rust; last code commit 2026-04-23). **`preview`** is a ground-up single-crate rewrite that shares no code with it, and is the one this entry describes. **`memory-testbench`** is the Python rig that validated the graph working-memory design before it was ported into `preview`. All numbers below are measured against `preview` at its last commit, 2026-06-20.

```text
 +--------+   gathered    +--------------------------+
 | graph  |   context     | local inference server   |
 | memory |-------------->| llama.cpp / MLX / oMLX   |
 +--------+               +--------------------------+
      ^                           |  SSE stream
      |                           v
      |  compact_turn     +----------------+
      |  at 75-85% fill   | LIT detector   | <50 ns/KB
      |                   +----------------+
      |                           |
      |                           v
      |                   +----------------+
      |                   | OMTF parser    | <100 us
      |                   | + XML dialects |
      |                   +----------------+
      |                           |  typed ToolCalls
      |                           v
      |   observations    +----------------+
      +-------------------| tool dispatch  | <5 ms/call
                          | 38 tools       |
                          +----------------+
```
*Fig. 1 — one harness turn: graph memory feeds the prompt, the stream passes LIT and the parser, dispatch writes observations back.*

## The tool protocol: OMTF v0.4, and three native dialects

The model never sees a JSON tool-call API. It emits fenced code blocks, and a synchronous parser turns them into typed `ToolCall`s. OMTF v0.4 is an opener-clean, body-first grammar: the fence opener carries the tool name and nothing else; the body reads `[option lines] → target → [payload]`; multi-valued keys repeat the key rather than nesting. `src/parser/registry.rs` is the single source of truth and lists **38 fence names** — `bash` / `read` / `edit` / `write` / `grep` / `astgrep` / `patch` / `python` / `tmux` / `fetch` / `check` / `outline` / `filemap` / `codegraph` and the rest, the six always-on graph-memory tools (`gather_context` / `compact_turn` / `update_importance` / `query_graph` / `hypothesize` / `resolve`), two opt-in search tools, and the orchestrator-only `delegate` / `list_agents` / `read_transcript`.

The important change since the first version of this write-up is that OMTF is no longer the only surface. Fighting a model's trained tool format turned out to be a losing trade, so each family now speaks its own: Qwen3.6 and Step-3.7 emit their native `<tool_call><function=NAME><parameter=KEY>` envelope, MiniMax emits `<minimax:tool_call><invoke name=…>`, Gemma stays on OMTF fences, and `preprocess.rs` / `xml.rs` normalise all of them down to one canonical fence grammar before parsing. That was a rename-and-reuse job, not three parsers: the two XML dialects carry the same `(name, params)` shape, so the MiniMax converter arms are shared verbatim.

The hard part still isn't the happy path. A quantised local model emits malformed fences constantly: unclosed `<think>` tags, truncated `write` bodies, heredocs that swallow the closing fence. `parser/` is ~12.9k LOC excluding its test module precisely because most of it is recovery: the XML converter (`parser/xml.rs`, 4,383 LOC) that never silently drops an invoke, a rescue path for unclosed envelopes, and a loud `⚠ TRUNCATED WRITE` when a fence closes by EOF instead of ```` ``` ````. That last one matters. A silently truncated `write` corrupts a source file that only breaks the build several turns later. One bug in this layer cost a whole model's evaluation: converted XML fences were being glued to the end of the preceding prose line, and because the OMTF fence parser is line-anchored, every tool call a model wrote a sentence before was silently dropped — which had been misread for weeks as the model looping. The parser is hot on every turn, so it carries a Criterion latency contract: **median < 100 µs** across a 16-fixture stream corpus that covers every real recovery path.

## Backend seam: one harness, three inference servers

`src/backend.rs:53` defines a `Backend` enum over three runtimes — llama.cpp, MLX, and oMLX (an MLX OpenAI-compatible server) — behind one surface that owns process lifecycle and token counting and absorbs the SSE-dialect differences between them. A bare launch still defaults to MiniMax-M2.7 UD-IQ4_NL on llama.cpp at 64K context; the working arm through mid-2026 was Qwen3.6-35B-A3B (a 35B MoE with 3B active) served as an oQ8 MLX distill.

The seam earns its keep. A measured decode-at-depth A/B found the MLX path holding **1.34–1.88×** the llama.cpp decode throughput, the lead widening with depth (43.5 vs 23.1 tok/s at 150k context). And oMLX's RAM→SSD prefix KV-cache restores per-turn re-prefill that llama.cpp's `--swa-full` forbids: **~97% saved per turn after the first**. On a 50-turn deep run that is the difference between ~5 min of re-prefill on oMLX and ~72 min on llama.cpp.

```text
50-turn deep run -- total re-prefill time

oMLX       |##                                  |  ~5 min
llama.cpp  |####################################|  ~72 min

(the gap is oMLX's RAM->SSD prefix KV-cache
 restore, ~97% saved per turn)
```
*Fig. 2 — total re-prefill across a 50-turn deep run: ~5 min on oMLX vs ~72 min on llama.cpp.*

A 12-prompt greedy quality smoke run against both paths returned **12/12 byte-identical outputs**, so the speed win came with no detectable quality loss on that set — though it is an easy set with short generations, and the write-up says so. Every one of those claims is a number from a script in `runs/bench/`. Not a vibe.

## Working memory, a code graph, and harness-managed compaction

Context management is the real engineering. Instead of summarising old turns into prose, ONI keeps a typed **working-memory graph** (`src/memory/`, 4,382 LOC): nine node types (Plan / Todo / Step / Observation / Error / Symbol / Decision / Fact / Hypothesis) and eight edge types (DependsOn / ProducedBy / Resolves / Supersedes / …), persisted to `./.oni-memory/graph.json`. Nodes are content-fingerprint-deduplicated: `add_node` keys an index on `(type, content)`, so identical content collapses to one UUID. Each turn opens with a `gather_context` call that runs an undirected BFS from an anchor union (previous-turn anchors + keyword hits + all Plan nodes), bounded by hop depth, an importance floor and a token budget. Pinned nodes (the live `todo` checklist) always surface, even below the floor.

Two colder stores sit beside it. A **code knowledge-graph** (`src/codegraph.rs` + `codegraph/`, 4,249 LOC) is built at startup: tree-sitter extractors for Rust / Python / JS / TS / Go, cross-file call resolution, Leiden clustering for god-node ranking, a content-hash cache, and a token-budgeted subgraph renderer behind a `codegraph` tool. An **in-loop LSP client** (`src/diagnostics/`, 2,354 LOC) speaks JSON-RPC to a real language server and returns compiler diagnostics for the file the model just edited, bounded by a handshake timeout and degrading gracefully when the server dies.

**Compaction** is a single harness-managed graph fold, triggered at 75–85% context fill (default 0.75; the shipped MiniMax config uses 0.85), and it runs in three deterministic stages:

1. **Backbone upsert (no LLM).** The latest check/lint digests, the files-written exec-trace, the open hypothesis, and the best objective score so far are written into the graph as Fact/Observation nodes. This is the amnesia floor: state survives even if the next stage extracts nothing.
2. **One-shot LLM extraction.** The model is asked once to `compact_turn` its remaining state. An empty result is *accepted*. No retry, no block, no prose-summary fallback.
3. **Render + rebuild.** A pure function deterministically renders the graph slice; the raw history is discarded and rebuilt to a clean `[system, original-task, anchor, note]` array.

Because the rebuild constructs a fresh array rather than splicing the old one, it structurally cannot emit a severed tool-role message. That retired a whole class of jinja-500 crashes the previous brute-truncation path produced under MiniMax.

The honest coda: a ten-loop forensic over 69 scored runs found the graph's *model-facing* injections had roughly zero causal effect on the score (fold partial r ≈ 0), and it also refuted my own standing thesis that the fold was poisoning the model. So the trajectory graph — a third store that had been writing notes into the model's context — was leaned back to pure offline bookkeeping and two of its modules deleted, and the fold-poisoning claim was marked refuted rather than quietly dropped. The compaction machinery stays because it is what keeps a 65K-token window alive across a two-hour run without a crash; the claim that it makes the model *smarter* did not survive measurement.

## Orchestration: the lever that lost

The most-tested feature in the repo is a two-role orchestrator, and the verdict register records it as **refuted**. The design: a thinking orchestrator decomposes a task and calls `delegate`, which spawns a fresh-context, single-shot, `memory: None` worker that cannot wander and cannot grind; the worker's `acceptance_test` is run by the harness with a strict exit-0 oracle, and the PASS/FAIL comes back as the tool result. To stop the orchestrator simply writing the code itself, its role is gated at dispatch to inspect-and-delegate, and the system prompt is generated from the same allow-set so the two cannot drift — with startup contracts that fail loudly if they ever do.

All of that works. The gate drove direct-execution attempts to zero, workers delegate reliably, `read_transcript` lets the orchestrator debug a failed worker before re-delegating, and one orchestrated run produced a genuine 9/9. And it still lost: in the largest matched-sampler A/B (N=12) the orchestrated arm cleared 6/9 on one run in twelve, against roughly 29% for the plain single-agent baseline. The wall turned out not to be prompt structure but multi-step commitment, which orchestration does not change. It is recorded in `docs/research/GROUND_TRUTH.md` with the reopen trigger it would take to overturn it, and left in the tree switched off by default. Building a lever, measuring it properly, and writing down that it lost is the part of this project I would defend hardest.

## The process-group SIGKILL sandbox

The `bash` tool spawns `bash -c $cmd` in its own process group (`.process_group(0)`, `src/tools/bash.rs:184`). On timeout it doesn't just kill the direct child; it sends `SIGKILL` to the whole group via `kill(-pid, SIGKILL)` (`kill_group`, `bash.rs:315`). The reason is specific, and it was the motivating incident: a grandchild process (e.g. a piped `python3 … | cat`) holds the pipe write-end open after the parent bash dies, so the harness's `read_to_end` never sees EOF and the entire run hangs indefinitely. Group-kill is the only correct fix. It's guarded by a regression test that forks exactly that grandchild and asserts the call returns within 8 seconds: if the hang regresses, the test fails.

## Latency as a contract, not an afterthought

Three Criterion benches encode the per-turn hot path as explicit budgets, and the physics behind each number is documented in the bench source: the parser at < 100 µs/corpus (so it never shows up in a session profile), tool dispatch at < 5 ms/call (imperceptible against ~22 ms/token inference), and the LIT loop detector at < 50 ns per 1 KB SSE chunk (it runs on every mid-stream chunk).

LIT ("Loop Iteration Tracker", `src/text_loop_detector.rs`) is itself a small piece of real engineering. A channel state machine routes each SSE segment into a think-buffer or action-buffer; each keeps a rolling 2048-char (~512-token) window; a half-window trigram Jaccard above 0.70 (think) / 0.90 (action) arms it, and a shared counter then walks a Soft → Hard → Compact tier ladder. A second, period-agnostic path was added after a model was caught repeating a ~6 KB block verbatim — far longer than the 2048-char window can see: it counts exact repeats of the most recent 1 KB chunk across a 32 KB per-channel history and arms at eight. Its first tuning (256 chars × 4) false-armed on legitimate repetitive code and was widened the same week. LIT is one of only two harness-side guardrails the project explicitly sanctions — and even then, action is always post-stream, never a mid-stream rewrite.

```text
       SSE segment (runs on every mid-stream chunk)
                         |
                channel state machine
                 /                 \
       think buffer             action buffer
       2048-char window         2048-char window
       Jaccard > 0.70 arms      Jaccard > 0.90 arms
                 |                   |
                 +---- chunk-repeat -+
                  1 KB chunk seen 8x
                  in 32 KB history
                         |
                  shared counter
                         |
                         v
         Soft --> Hard --> Compact tier ladder
         (action is post-stream, never mid-stream)
```
*Fig. 3 — LIT internals: two rolling buffers, a long-period chunk-repeat path, one shared tier counter.*

## Honest scope

ONI is a single-developer research harness, not a hosted product. It targets a specific machine (M4 Max, 128 GB) and a small set of local quants, it has no CI, and the last commit is 2026-06-20 — it is paused, not abandoned. The Criterion budgets are design targets tracked in source, not a published performance report, and Criterion's HTML output is gitignored. The capability story is mixed and the repo says so: on the harness's main scored eval — an orbital-rendezvous coding task marked out of nine checks — nine separate runs on disk reached a perfect 9/9, but the per-run rate is a stochastic tail rather than a reliable result, and an earlier evaluation suite was deleted so several of its headline numbers now survive only as prose and are flagged as unverifiable. Levers that lost (orchestration, graph injections, anti-repetition sampling, a bigger context window) are recorded as refuted with the evidence, not quietly removed.

What it demonstrates is end-to-end systems ownership in Rust: a recovery-heavy parser, a backend abstraction, two graph stores and an LSP client, process sandboxing, and streaming detectors — all under test, all under latency budget, and all measured before being believed.
