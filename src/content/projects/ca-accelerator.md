---
title: Cellular-Automaton SoC Accelerator
tagline: A self-designed programmable Wolfram-rule accelerator on a RISC-V SoC — synthesised, implemented, demoed live on FPGA.
order: 2
buckets: [hardware]
spokes:
  - { id: finance, role: flagship, blurb: "Custom datapath accelerator closed on Artix-7 — the FPGA→HFT-hardware story." }
  - { id: drone, role: secondary, blurb: "Embedded hardware design: custom accelerator integrated into a RISC-V SoC with live video out." }
stack: [SystemVerilog, Vivado, Artix-7, RISC-V]
metrics:
  - { label: "Accelerator", value: "4,433 LUT / 1,467 FF", source: "audit §comp32211 FINAL (Phase 4 report Tables 1–3)" }
  - { label: "Whole SoC", value: "43.81% LUT · 96% BRAM", source: "audit §comp32211 FINAL (Phase 4 report)" }
  - { label: "Rules", value: "256 runtime-selectable", source: "audit §comp32211 (unit_automaton.sv:277-283)" }
role: Designed the unit_automaton accelerator (rule-as-lookup, 32-bit LFSR seed, compute/write FSM, byte-enabled framestore writes), integrated it into the drawing engine, drove it from a RISC-V MMIO program, and took it through Vivado synthesis + implementation.
status: case-study
repo: { kind: case-study }
dates: "2025–26"
---

A 1-D elementary (Wolfram) cellular-automaton hardware accelerator added as a drawing-engine unit on a
RISC-V SoC. The transition function is a pure bit-indexed lookup — one 8-bit register reconfigures the
entire rule with zero logic change — seeded by a 32-bit LFSR. It shares the engine's req/ack/byte-enable
memory bus and is driven over MMIO from a RISC-V program.

Taken all the way through **Vivado synthesis + implementation onto an Artix-7 and demonstrated live on a
monitor.** The Phase-4 writeup reasons honestly about resource/timing trade-offs: BRAM at 96% (the
framebuffer) dominates device fullness; Vivado inferred a DSP for address arithmetic that shift/add would
keep in LUTs; back-pressure must be exercised in sim "or bugs hide."

_Private UoM coursework — presented as a case study, no code link._
