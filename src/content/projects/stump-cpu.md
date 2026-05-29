---
title: Stump CPU — Spartan-6 RISC Processor
tagline: Complete 16-bit multi-cycle RISC CPU hand-built in Verilog and closed on real Spartan-6 silicon at 98% slice occupancy.
order: 5
buckets: [hardware]
spokes:
  - { id: finance, role: flagship, blurb: "Stump RISC CPU synthesised + placed-and-routed on Spartan-6 — timing met at 98% slice occupancy. The FPGA→HFT hardware story starts here." }
  - { id: drone, role: secondary, blurb: "Bottom-up processor design: datapath, FSM, ALU, regfile — the hardware track that feeds every embedded project." }
stack: [Verilog, "Xilinx ISE", "Spartan-6"]
metrics:
  - { label: "Slice LUTs", value: "2,068 / 2,400 (86%)", source: "audit §comp22111 (Stump_Board.mrp:24)" }
  - { label: "Occupied Slices", value: "591 / 600 (98%)", source: "audit §comp22111 (Stump_Board.mrp:37)" }
  - { label: "Timing score", value: "0 — all constraints met", source: "audit §comp22111 (Stump_Board.par:152)" }
role: Designed the datapath (ALU, shifter, sign-extender, 8×16-bit register file, muxes), the 3-state control FSM (FETCH/EXECUTE/MEMORY), and the instruction decoder. Wrote Battleship in Stump assembly against a memory-mapped 8×8 LED matrix.
status: case-study
repo: { kind: case-study }
dates: "2024–25"
---

A complete 16-bit multi-cycle RISC processor — the Manchester "Stump" — built bottom-up in Verilog.
The datapath covers an 8-op ALU, barrel shifter, sign-extender, an 8×16-bit register file, and all the
mux infrastructure to route operands through FETCH → EXECUTE → (MEMORY if LDST) → FETCH.
The 3-state control FSM and instruction decoder are student-authored; the top-level board wrapper and
memory model were provided.

**Taken all the way through synthesis, place-and-route, and timing closure on a Spartan-6 xc6slx4**
(Xilinx ISE, 2024-11-27): 2,068/2,400 LUTs (86%), 591/600 occupied slices (98%), timing score 0 —
all constraints met. A near-full device. No user timing constraint was set, so ISE reports score 0
rather than a max-frequency figure; the binding constraint was physical resources, not clock.

To demonstrate the CPU works end-to-end: wrote Battleship in Stump assembly, driving a
memory-mapped 8×8 LED matrix via MMIO (`st rN, [r1]` pointer-increment pattern, base `0xFF00`).

_Private UoM coursework — presented as a case study, no code link._
