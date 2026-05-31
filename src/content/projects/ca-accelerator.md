---
title: Cellular-Automaton SoC Accelerator
tagline: A from-scratch SystemVerilog drawing unit that renders Wolfram cellular automata — programmable rule as a pure lookup, LFSR-seeded, taken through Vivado to silicon and demoed live on a monitor.
order: 2
section: quant
buckets: [hardware]
stack: [SystemVerilog, Vivado, Artix-7, RISC-V assembly, Questa]
metrics:
  - { label: "Accelerator (block)", value: "4,433 LUT", source: "Phase 4 SOC report, Table 3 (u_automaton hierarchical utilisation)" }
  - { label: "Whole SoC fill", value: "96.0% BRAM", source: "Phase 4 SOC report, Table 1 (post-implementation, XC7A35T)" }
  - { label: "Rule space", value: "256 rules", source: "ca-accelerator: Phase2/Phase2/unit_automaton.sv:281-282 (rule_eff[{L,M,R}])" }
  - { label: "Functional coverage", value: "100% stmt/branch/cond/FSM", source: "Phase 2 SOC report §4.2 (Questa, toggle 30.4% justified)" }
role: Designed unit_automaton from scratch (programmable rule-as-lookup, 32-bit LFSR seed, 3-state compute/write FSM, byte-lane framestore writes with req/ack backpressure), wrote a coverage-driven testbench to 100% functional coverage, integrated it into the drawing engine replacing a dummy slot, drove it from a RISC-V MMIO program, and closed it through Vivado synthesis + implementation on Artix-7 with a live monitor demo.
status: case-study
repo: { kind: case-study }
dates: "2025–26"
---

A 1-D elementary (Wolfram) cellular automaton implemented as a hardware drawing unit on a RISC-V SoC, written from scratch in SystemVerilog and taken all the way to **real silicon on a Xilinx Artix-7 (XC7A35T), demonstrated live on a monitor.** It renders Rule 30 / Rule 54 / Rule 90 Sierpinski-style fractals straight into the framebuffer.

## The idea that makes it cheap

The entire transition function is one bit-indexed lookup. For each cell the three-cell neighbourhood `{Left, Middle, Right}` forms a 3-bit index `0..7`, and the next state is simply that bit of the rule register:

```verilog
nb_idx = {L, M, R};        // L=bit2, M=bit1, R=bit0
nxt    = rule_eff[nb_idx]; // the whole Wolfram rule, as a lookup
```

That's the genuinely nice part: **all 256 elementary rules live in a single 8-bit register** (`r2[7:0]`), so the host reconfigures the automaton's behaviour at runtime with one MMIO write and *zero* logic change. Writing 0 falls back to Rule 30 (`8'h1E`). There is no per-rule case statement, no recompile — the rule *is* the data. Edge cells use zero-padded neighbours.

## Seeding: deterministic but rich

Row 0 is seeded from `r1`. A seed of `0` plants a single hot cell in the centre (the classic textbook seed that grows the Sierpinski triangle). Any non-zero seed is run through a **32-bit maximal-length LFSR** (taps at bits 0, 1, 21, 31 — polynomial x³² + x²² + x² + x + 1) to fill the first row with a pseudo-random but fully repeatable pattern. One register selects between "clean fractal" and "noisy initial condition".

## The hard part: a streaming compute/write FSM over a shared memory bus

This isn't a pure combinational generator — it has to *write pixels into a framebuffer it shares with the rest of the drawing engine*, and it cannot assume the memory is ever ready. So the datapath is a 3-state machine (`C_IDLE → C_RUN → C_DONE`) that interleaves computing the next row with issuing single-byte framestore writes:

- **Addressing is byte-packed.** The framebuffer is 4 pixels per 32-bit word, so a pixel at `(x, y)` maps to word address `y·(W/4) + (x>>2)`, with `x[1:0]` selecting the byte lane. Writes go out with an **active-low byte-enable mask** (`de_nbyte`) so a single pixel is written without a read-modify-write.
- **Backpressure is respected, not assumed.** Every write holds `de_req` high and only advances on `de_ack`; if the arbiter stalls, the FSM freezes the address/data/enable and waits. This is the correctness trap in shared-memory accelerators, and it's handled explicitly in `C_RUN`.

The unit speaks the engine's standard `req/ack/busy/done` handshake, so from the drawing engine's point of view it's just another drawing primitive.

## Correctness is proven, not assumed

The standalone Questa testbench is the part I'm proudest of, because the failure modes here are subtle. It hits **100% statement, branch, condition, expression and FSM-state/transition coverage** on the unit. Specifically it:

- **Forces the backpressure path** with a one-shot stall shim that gates `de_ack`, then asserts the unit really did suppress its request and hold the bus stable while stalled (`de_req && !de_ack` is covered, not just assumed reachable).
- **Forces the C_RUN→C_IDLE transition** by pulsing async reset mid-run — the one FSM edge a normal run never takes.
- **Sweeps geometry** (widths 1…640, tall frames up to 1023 rows) specifically to flip `de_addr[17]` and exercise every byte-lane/address pattern.
- **Dumps the framebuffer to a text file** for offline pixel-diffing against a reference.
- Carries SystemVerilog assertions on the handshake (`ack` is a one-cycle pulse, no new `req` while `busy`, `ack` implies a prior `req`).

Toggle coverage sits at 30.4% — and the report says *why* rather than hiding it: the datapath is write-only (so `de_r_data` never toggles by design), config inputs latch once per run, and the colour byte transitions once and holds. Inflating that number would mean adding stimulus with no behavioural meaning, so I didn't.

## Real numbers on real silicon

Phase 4 took the whole SoC through Vivado synthesis **and** implementation on the XC7A35T (32,600 LUTs / 65,200 FFs / 75 BRAM). Measured post-implementation:

| | u_automaton (my block) | Whole SoC |
|---|---|---|
| LUTs | 4,433 | 14,282 (43.81%) |
| Flip-flops | 1,467 | 7,226 (11.08%) |
| BRAM (36k eq.) | 0 | 72 / 75 (**96.0%**) |
| DSP | 1 | 2 (1.67%) |

The honest engineering read, from the report:

- **The accelerator uses zero BRAM** — it's a pure-logic datapath. The device is BRAM-bound at 96%, and that's the *framebuffer*, not the compute. Memory capacity, not logic, is the headroom constraint here.
- **Vivado inferred a DSP block for the address arithmetic** (`y·(W/4)`). A multiply-by-constant or shift/add would have kept it in LUTs — a real, specific lesson about how innocuous-looking RTL maps to hardware.
- **Timing risk lives on the memory path**, where the VDU fetch contends with accelerator writes through the arbiter — not in the automaton itself.
- And the candid bit: *"Initially while designing I simplified a lot of the structure to make it fit within this ecosystem; in hindsight I feel like I could have done more with this hardware."* The unit is deliberately scoped to one row at a time rather than parallelised across lanes.

## How it fits together

Four phases: **Phase 1** was a verification warm-up — I bring-up-tested five supplied drawing units against a 502-pixel golden image and correctly flagged four defective and one good (e.g. one unit that silently dropped sloped-line writes). **Phase 2** built and verified the automaton unit. **Phase 3** dropped it into `drawing_engine.sv` in place of a dummy slot and showed Rule 90 fractals on the virtual screen. **Phase 4** integrated, synthesised, implemented and demoed it on the board, driven by a hand-written RISC-V program (`automaton.s`) that MMIO-writes the seed/rule/colour registers, fires `GO`, and polls the `BUSY` status bit to completion.

_Private UoM coursework (COMP32211) — presented as a case study, no public code link._
