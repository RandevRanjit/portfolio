---
title: Interpretable MPCC Racing Controller
tagline: Final-year dissertation — model-predictive contouring control on a Fiala-tire bicycle plant.
order: 4
buckets: [control]
spokes:
  - { id: motorsport, role: flagship, blurb: "Graduate-level MPC: CasADi/IPOPT MPCC with JIT + dual warm-start vs RRHC/DDP." }
stack: [Python, CasADi, IPOPT, SciPy]
metrics:
  - { label: "Horizon", value: "N=20 @ dt=0.02s", source: "audit §racing-lab-tyd (mpcc/ocp.py)" }
  - { label: "Solver step", value: "19.77 ms mean", source: "audit §racing-lab-tyd (debug.csv, 3,163 steps)" }
  - { label: "Integrator", value: "Radau IIA (implicit)", source: "audit §racing-lab-tyd (integrator.py)" }
role: Sole author (dissertation). Built the MPCC OCP, dual warm-starting, JIT compilation, the Fiala-tire plant, and the comparison harness against RRHC and DDP.
status: case-study
repo: { kind: private }
dates: "2025–26"
---

My final-year dissertation: a model-predictive contouring controller for autonomous racing, built on a
CasADi/IPOPT symbolic NLP with **JIT compilation and dual (primal + dual) warm-starting**, on a 3-DOF
bicycle plant with a Fiala tire model and a GG friction-ellipse hard constraint. It's compared against a
heuristic racing-line controller (RRHC) and DDP.

This is graduate-level numerical-optimisation engineering, not a tutorial MPCC: the k=0 tube-constraint
skip is a deliberate fix for off-track infeasibility, and the integrator is Radau IIA (implicit, A-stable)
rather than naive RK4. Constraints made tangible — timing, feasibility, and what an NLP solver will and
won't converge on.
