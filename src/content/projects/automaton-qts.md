---
title: Quant Trading System (Automaton-QTS)
tagline: A multi-signal trading engine, an agent-based market simulator, and a relation-typed contagion-propagation graph that I proved is dead in equities and alive in crypto.
order: 1
section: quant
buckets: [systems, control]
stack: [Python, PyTorch, torchdiffeq, NautilusTrader, hftbacktest, scipy, SQLAlchemy/TimescaleDB]
metrics:
  - { label: "Code", value: "45.7k LOC Python", source: "automaton-qts: git ls-files '*.py' | xargs wc -l = 45,712 (2026-09-11)" }
  - { label: "Tests", value: "1,314 tests, 129 files", source: "automaton-qts: def test_ count over tests/ = 1,314 across 129 files (2026-09-11); the coverage.xml line-rate 0.8189 is an artefact dated 2026-05-22 and predates the crypto package" }
  - { label: "Crypto contagion (research-stage, n=3)", value: "+9.2%/event", source: "Internal crypto contagion feasibility report §1 (2026-05-25), re-read 2026-09-11; not a deployed or validated strategy, and the E1–E5 scripts behind it were left in /tmp and are gone" }
  - { label: "Terra linked-peer signal (research-stage, n=3)", value: "p=0.0009 @72h", source: "Internal crypto contagion feasibility report §3 (2026-05-25), re-read 2026-09-11; n=3 cascades, pipeline not in public repo" }
  - { label: "Live-paper Phase-1 gate", value: "built, never run", source: "automaton-qts: scripts/run_contagion_broadened_backtest.py + src/qts/propagation/crypto/detect.py, merged 2026-05-31; devlog.md still lists running it as the next action and no verdict artefact exists on disk (2026-09-11)" }
role: Sole author. Built the signal/risk/execution core, the human-gated LLM oversight trail, an agent-based market simulator for synthetic data, and the relation-typed propagation-graph research line (equity negative + crypto positive).
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/Automaton-QTS" }
dates: "2026"
---

Three systems share one codebase. A multi-signal trading engine with hard risk limits and a human-in-the-loop audit trail. An agent-based market simulator that generates synthetic order flow and news. And a research line on event-driven **contagion propagation**, where the headline result is a *negative* one I trust as much as the positive.

## The research line is the real work

The question: when a named asset gets hit by an event (an earnings surprise, a hack, a depeg), can you predict which *unnamed* peers react, better than plain correlation can? Correlation is the adversary here. The peers that matter are often the ones that *don't* co-move with the source in normal times.

The model is a **relation-typed propagation operator**. Edges come from a typed link graph (competitor / supplier / customer / partner for equities; `shares_oracle`, `bridges_to`, `collateral_of`, … 7 channels for crypto). Each relation type `r` gets its own bilinear form `M_r`, so the edge weight is `W[i,j] = ξ_iᵀ M_r ξ_j` from the endpoints' *features*, not their identities. An event is a `do()`-intervention: pin the named node to its merit, then unroll the operator a fixed number of steps, re-pinning the source each step. Because the rule is *per-type and feature-conditioned*, a type learned on some links transfers zero-shot to links it never saw in training. That transfer is the only thing that makes this more than curve-fitting. The gate enforces exactly that: train on a stratified subset of edges, score on held-out edges, and require beating a per-pair β baseline fit on each held-out pair's *own* full history.

I also tried to graduate the linear operator twice: a graph neural-ODE (continuous-time, nonlinear tanh message passing via `torchdiffeq`) and an NBFNet-style path-aggregation model (vector node states, per-relation message layers). Both are in the repo. Both are documented as *not improving transfer* over the linear model. Keeping the dead ends in, labelled, is the point.

## Proving it with an adversarial world before touching real data

Before any real market data, I built a synthetic ground-truth world designed to *defeat correlation*. Each event is a 2-hop causal chain A → B → C: B and C are constructed factor-orthogonal to A (so a correlational baseline sees nothing), while a decoy node *is* factor-correlated with A but has no causal edge — pure bait. The A→C link has no direct feature match; it exists only as the composition R1∘R2 of two relations, so reaching C requires the model to learn both types and compose them across the unroll. The operator has to beat two baselines (a no-propagation floor and a β-projection correlational bar) *and* transfer to a held-out chain it never saw coupled. Correctness is something you prove against an adversary, not something you assert. One event looks like this:

```text
             R1             R2
    [A]* ---------> [B] ---------> [C]
     .                              ^
     .   factor-correlated          |
     .   with A but NO         B and C are built
     v   causal edge           factor-orthogonal to A;
   [DECOY]                     A->C has no direct
                               feature match -- only
   correlation fires here;     the composition R1 o R2
   the operator must not       reaches C

   * = A pinned to its merit by do(); re-pinned each step
```

*Fig. 1 — one synthetic event: a two-hop causal chain plus a factor-correlated decoy. Correlation fires on the decoy; only learned relation composition reaches C.*

## The equity result: a clean, expensive negative

On real equities the operator **fails** the gate. The setup: 15 S&P names, 473 earnings events (2016–2023), 75,325 FNSPID news articles filtered to the universe, and 43 directed causal edges discovered by an LLM (Qwen via llama.cpp) from co-mention pairs at 80% rejection. It does not beat per-pair correlation on held-out links at any horizon or universe (14 experiments, three universes including small-cap inattention names). The LLM link graph itself is genuinely correct (right competitors, right supplier/customer directions), so the failure isn't the graph — it's that liquid US equities reprice peer information too fast to leave a tradeable edge. I wrote that up as a definitive negative and *pivoted* rather than torturing the data.

## The crypto result: the mechanism is alive — and modest, and honest

Repointing the same machinery at crypto contagion cascades (hacks, depegs, insolvencies), the mechanism is real:

- Terra/UST: graph-linked peers dropped significantly more than unlinked tokens, one-sided Mann-Whitney **p=0.0009 at 72h**. At 24h, the three most-negative tokens in the entire cross-section were all graph-linked.
- A costed, market-neutral backtest (short the top-3 graph-linked peers per cascade, net of real perp funding and 5bps/side slippage) earns **+9.2%/event, Sharpe 1.49, win 2/3** across Terra (+19.6%), Curve/Vyper (+16.4%), and FTX (−8.2%).
- The candid part: the raw outright short looks far better (+20.9%/event, Sharpe 3.78) but that's almost entirely BTC-crash beta, not contagion alpha — so I report the market-neutral number. And perp funding kills the edge at the violent epicentre: shorting SOL after FTX was +39.7% gross but −22.4% in funding, because the SOL perp traded at a deep stress discount. The tradeable edge lives in *second-ring liquid DeFi peers*, not the spectacular collapses (which are un-borrowable *and* funding-toxic).

Per cascade, the net numbers:

```text
              -10       0        +10       +20
   Terra                    |#################### +19.6
   Curve/Vyper              |################     +16.4
   FTX               ########|                      -8.2
                ---------+--------------------
   mean +9.2 per event    Sharpe 1.49    win 2/3    n=3
```

*Fig. 2 — net market-neutral return per cascade (% per event), after real perp funding and 5 bps/side slippage. One losing event out of three.*

Reactions are BTC-adjusted abnormal CARs (so "everything dumps with BTC" is removed by construction), and the delisted flagship pairs (FTT/LUNA/UST/SRM) are only measurable because I pull `data.binance.vision` archive dumps that retain them. **n=3 cascades**: the Sharpe is illustrative, not forward-credible, and the LLM is pre-cutoff so hindsight is mitigated, not eliminated. I say so in the report.

## What I built next, and the verdict I never got

The obvious next move was to stop studying old cascades and start forward-testing one. The design is written down — spec, plus the rejected alternatives in a decision log — and Phase 1 of it, the part that decides whether there is anything worth forward-testing at all, is built and merged.

Phase 1 broadens the trigger. Flagship cascades are far too rare to produce a paper track record in any sane window, so `ShockDetector` (a Protocol, with `IdiosyncraticDropDetector` as the v0 implementation) fires on any token whose trailing **BTC-adjusted** abnormal return falls past a threshold — 15% over 24h by default, at most one event per token per 72h. BTC-adjusted rather than raw, because a raw drawdown is exactly the market-wide beta the operator is built to strip out. The gate runner feeds those detected events back through the same dataset → fit → Null-A → Null-B → costed-backtest path the flagship study used, and ends on a hard GO/NO-GO: the linked-peer drawdown must be significant, the operator must beat the pairwise baseline, and the market-neutral Sharpe must clear 1.0. The watchlist it runs over is a union of the cascade universes and their structural links — 33 tokens, 31 typed edges.

Writing that also caught something embarrassing about the number in the section above. The backtest annualises its Sharpe with an `events_per_year` argument whose default was a hardcoded `12.0` — so **1.49 is scaled as though twelve cascades happen a year**, while the three I actually measured span about fourteen months. The new code computes the detected frequency from the panel instead, and its own docstring says the old default "would otherwise misscale the Sharpe". Read 1.49 as illustrative arithmetic, not as a Sharpe.

And then it stopped. Running the gate needs the local LLM up and the Binance archive pulls done, and I never got back to it. The last commit on `main` is 2026-05-31, the devlog still lists running the gate as the next action, and there is no verdict file anywhere on disk. So the detector is real, the gate is real and unit-tested (9 tests for the new pieces, 36 across the crypto package), and the answer it exists to produce does not exist.

## The engine and the simulator around it

The propagation work sits on a real trading stack. Technical indicators, FinBERT/VADER/GDELT sentiment fusion, and a 2-state Gaussian-HMM vol regime feed a composite alpha. Behind that sits a risk engine: a circuit breaker (compared in absolute-loss units to dodge float-division rounding) plus max-drawdown / position-size / open-position limits. The LLM oversight layer is **analyst-only**. It can *propose* parameter changes, but every change goes through a Rich-terminal approve/reject UI with a git audit trail, and `config/risk_limits.json` is architecturally off-limits, guarded by a pre-commit hook.

Strategies run in three places: a bar-level deterministic backtester, a NautilusTrader integration (~1.35k LOC) for live/backtest parity, and a `world/` agent-based simulator — market-maker and persona agents trading through an order book on a simulated clock, emitting bars + synthetic news, so strategies can be stress-tested on flow the real market never produced. The whole path in one view:

```text
     technicals + FinBERT/VADER/GDELT sentiment
          + 2-state Gaussian-HMM vol regime
                       |
                       v
              [ composite alpha ]
                       |
                       v
              [   risk engine   ]   circuit breaker
                       |            (abs-loss units)
                       |            max-drawdown /
                       |            position-size /
                       v            open-position limits
              [    execution    ]
                bar backtester / NautilusTrader
                (live+backtest parity) / world/ agent sim

   LLM oversight is analyst-only:
   propose -> Rich approve/reject UI -> git audit trail
   config/risk_limits.json: off-limits (pre-commit hook)
```

*Fig. 3 — the signal path. The LLM proposes, a human approves, and `config/risk_limits.json` stays out of reach.*

## Honest scope

The "50 µs latency" HFT path is a thin wrapper over the Rust `hftbacktest` library (lazy-imported; the engine is theirs, the adapter and result-mapping are mine). I did not write a price-time-priority matching engine. The crypto edge is `n=3` and still needs post-cutoff out-of-sample cascades before it is a strategy rather than a study; the event-detection feed it also needed now exists as code, but has never been run end to end.

The reproducibility is worse than the write-up implies. The five experiment scripts that produced the +9.2% and the p-values were written into `/tmp` and never promoted into `scripts/` — they are gone. What survives is the dated report and the committed package (nulls, dataset builder, costed backtest, 36 tests), which is enough to rebuild the harness and not enough to re-run it today. The Binance archive adapters that make the delisted pairs measurable are still uncommitted, so they are not on GitHub either. Prices in my own bar-level backtester are floats on a single-level book, and the NautilusTrader live path is a skeleton I know to be broken — `nautilus/live.py` builds the data and exec client configs and then never passes them to the node. The wins here are the *method* and the *honesty of the evaluation*, not a deployed money-printer.