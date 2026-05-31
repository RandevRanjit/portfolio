---
title: Stump — 16-bit RISC CPU closed on Spartan-6 silicon
tagline: A multi-cycle 16-bit RISC processor built bottom-up from RTL primitives in Verilog, then synthesised, placed-and-routed, and timing-closed on a real Spartan-6 at 98% slice occupancy — the first design I carried through the full FPGA back-end flow.
order: 5
section: quant
buckets: [hardware]
stack: [Verilog-2001, "Xilinx ISE", "Spartan-6 (xc6slx4)", ModelSim, "Stump assembly"]
metrics:
  - { label: "Slice LUTs", value: "2,068 / 2,400 (86%)", source: "comp22111-processor: synthesis/Stump_Board/Stump_Board.mrp:24" }
  - { label: "Occupied slices", value: "591 / 600 (98%)", source: "comp22111-processor: synthesis/Stump_Board/Stump_Board.mrp:37" }
  - { label: "Slice registers", value: "1,052 / 4,800 (21%)", source: "comp22111-processor: synthesis/Stump_Board/Stump_Board.mrp:19-20" }
  - { label: "Timing score", value: "0 (timing met)", source: "comp22111-processor: synthesis/Stump_Board/Stump_Board.par:152,179" }
role: Authored the datapath (ALU, barrel shifter, sign-extender, 8-register file with R0=0 / R7=PC, operand muxes), the 3-state control FSM (FETCH/EXECUTE/MEMORY) and the control-decode logic, and implemented the LDST and BCC instruction paths. Top-level board wrapper and 1.5k-line memory model were provided. Wrote test programs in Stump assembly including a Battleship game driving a memory-mapped 8×8 LED matrix.
status: working
repo: { kind: case-study }
dates: "2024–25"
---

The Manchester **Stump** is a 16-bit, ARM-flavoured load/store RISC machine.
I built it bottom-up in Verilog — from register-transfer primitives up to a working processor — and then took it through synthesis, place-and-route, and timing closure on a real Spartan-6 FPGA.
It's the first design I carried all the way through an FPGA back-end flow, and it fits a near-full part with timing met.

## What it actually is

A **multi-cycle** processor, not a pipelined one.
Every instruction walks a 3-state control FSM in `Stump_FSM.v`: **FETCH → EXECUTE**, then **→ MEMORY only if the instruction is a load or store**, otherwise straight back to FETCH (reset enters FETCH; state enums FETCH=0, EXECUTE=1, MEMORY=2 in `Stump_definitions.v`).
Multi-cycle is the right call here: it keeps the datapath small enough to fit a tiny part while still supporting variable-length instructions, and it makes the load/store path — which genuinely needs an extra bus cycle — explicit in the control rather than hidden in pipeline hazard logic.

The ISA is **fixed 16-bit** with the opcode in `ir[15:13]` — eight instruction classes: `ADD, ADC, SUB, SBC, AND, OR, LDST, BCC`.
Three instruction formats: Type 1 (register–register, with an optional shift on operand A), Type 2 (register–immediate), and Type 3 (`LDST` plus `BCC` branches).
`BCC` is **branch-on-condition-codes**, not an unconditional jump: it tests the four-flag condition register (N, Z, V, C, set during arithmetic/logic) against the condition field and resolves the target as **PC + offset**, PC-relative.

## The design decisions that matter

**Register file: 8 registers, but two are special.** R0 is **hardwired to zero** and R7 **is the program counter**. That's not an accident — a hard zero register lets you synthesise `MOV` and `CMP` for free (they're just adds/subtracts against R0), and putting the PC inside the register file means branches are ordinary ALU adds (`PC ← PC + offset`) instead of a bolted-on adder. I built the file from `Stump_reg16bit` / `Stump_reg4bit` primitives wired through `Stump_mux16bit` selectors.

**Shifts live on operand A, in the same cycle as the ALU op.** `Stump_shifter` sits in front of the ALU and applies the 2-bit `shift_op` to source A before it reaches the arithmetic unit — so a shifted add is one instruction, one EXECUTE cycle. Right shifts get a dedicated path because (unlike left shifts) you can't fake them with an addition.

**Sign extension is its own decoded path.** `Stump_sign_extender`, driven by `ext_op`, widens the immediate field correctly for the Type-2 and branch-offset cases — getting sign behaviour right is exactly the kind of thing that's invisible until a negative branch offset sends you to the wrong address.

I authored the ALU (8 functions, selected by `alu_func[2:0]`), the control-decode block, the datapath wiring (`opB_mux_sel`, `cc_en`, `reg_write` control lines), and the full LDST and BCC instruction paths. The commit history shows the real build order — basic ALU first, then LDST and BCC layered on — so the student-authored core is provable, not asserted. The top-level `Stump.v` skeleton, the 1,545-line `Stump_Memory.v`, and the `Stump_Board.v` wrapper were provided infrastructure. There's also a **MU0** accumulator machine in the tree — the simpler Year-1 design, reused here as a warm-up before the full Stump.

## Closed on real silicon

Synthesised, mapped, placed-and-routed in **Xilinx ISE (2024-11-27)** for a **Spartan-6 xc6slx4, package cpg196, speed grade −2** — a deliberately small part.

| Resource | Used | Available | % |
|---|---|---|---|
| Slice LUTs | 2,068 | 2,400 | **86%** |
| Occupied slices | 591 | 600 | **98%** |
| Slice registers (flip-flops) | 1,052 | 4,800 | 21% |
| Fully-used LUT-FF pairs | 958 | 2,123 | 45% |
| Bonded IOBs | 63 | 106 | 59% |

Timing score **0** (setup 0, hold 0), with **all signals completely routed** — the design fits and meets timing on a near-full device. Numbers are from the real `Stump_Board.mrp` map report and `Stump_Board.par` place-and-route report.

**Honest caveat on speed:** there's no fmax to quote. The design carries no user-defined timing constraint, so ISE reports a timing *score* of 0 (constraints met) rather than a maximum clock frequency. The binding constraint here was physical resources — 98% slice occupancy — not the clock. I'd rather state that plainly than invent a megahertz number.

## Proving it runs

To show the CPU works end-to-end rather than just simulates, I wrote programs in Stump assembly — including **Battleship** driving a **memory-mapped 8×8 LED matrix** (base `0xFF00`, 64 LEDs). The init loop writes colours via the `st rN, [r1]` store-and-pointer-increment pattern (`ocean_blue = 0x03`), which exercises the LDST path, the MMIO address decode, and assembly fluency on a processor I'd built myself.

Verification is testbench-driven the classic Verilog way: `Stump_Testbench.v` and `Stump_ALU_Testbench.v` use `$display`-and-compare self-checking. This is Verilog-2001, so there are no SystemVerilog assertions and no coverage instrumentation — the limitation is real and I'll own it. The correctness argument rests on directed testbenches plus a design that mapped and routed cleanly on hardware, not on formal proof.

## Honest scope

Guided coursework (COMP22111, Processor Microarchitecture): the top-level skeleton, memory model, and board wrapper were provided; I built the processor's brain — datapath, control FSM, control-decode, ALU, and the LDST/BCC instruction paths. The defensible line is the true one: I designed a multi-cycle 16-bit RISC processor in Verilog and closed it on a Spartan-6 at 98% device occupancy with timing met.

_Private UoM coursework on internal GitLab — presented as a case study, no public code link._
