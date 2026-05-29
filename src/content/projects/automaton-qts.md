---
title: Quant Trading System (Automaton-QTS)
tagline: Multi-signal trading engine with a tick-level, queue-position-aware HFT backtester.
order: 1
buckets: [systems, control]
spokes:
  - { id: finance, role: flagship, blurb: "Tick-level HFT backtester (50 µs latency) + regime-gated cross-asset propagation graph." }
stack: [Python, NautilusTrader, hftbacktest, PyTorch, TimescaleDB]
metrics:
  - { label: "Code", value: "40.9k LOC", source: "audit §automaton-qts (git ls-files)" }
  - { label: "Coverage", value: "81.9%", source: "audit §automaton-qts (coverage.xml:2)" }
  - { label: "Sim order latency", value: "50 µs", source: "audit §automaton-qts (hft_backtest.py:242)" }
role: Sole author. Built the signal pipeline, risk engine (hard circuit breakers), dual backtester, and the regime-gated propagation-graph research module.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/Automaton-QTS" }
dates: "2026"
---

A multi-signal trading system that fuses technical indicators, NLP sentiment (FinBERT), and a
2-state Gaussian-HMM volatility regime into a composite alpha score, with hard risk limits and a
human-in-the-loop parameter-governance trail. Two backtest engines run side by side: a bar-level
deterministic one and a **tick-level, queue-position-aware** engine (hftbacktest) with configurable
order latency.

The research module is a **regime-gated bilinear propagation graph** that learns nth-order cross-asset
reactions, evaluated against an adversarial confound simulation where the target asset is
factor-orthogonal to its neighbours — so a correlational baseline *can't* find it. Correctness is
something you prove, not assume: a two-part feasibility gate requires beating both the no-propagation
floor and the correlational baseline, with transfer to a held-out event.

_Honest scope:_ prices are floats, the order book is single-level — production HFT needs integer-tick
pricing and a price-time-priority matching engine (see "what I'd build next" on the Finance page).
