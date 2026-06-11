---
title: "RRHC vs MPCC: A Reactive Racing Controller That Beats Online Optimisation"
tagline: Final-year dissertation — a model-free heuristic racing controller, benchmarked against an IPOPT-solved MPCC under an enforced fairness contract.
order: 4
section: motorsport
lineage:
  - { note: "RRHC ported onto a 3D quadrotor — same algorithm, Formula car to FPV drone", slug: aero-lab }
buckets: [control]
stack: [Python, NumPy, SciPy, CasADi, IPOPT, Optuna]
metrics:
  - { label: "Lap time vs MPCC", value: "12.2% faster", source: "report/sections/06_conclusion.tex:103" }
  - { label: "Per-step compute", value: "153x cheaper", source: "report/sections/04_results.tex:43" }
  - { label: "Deadline overruns (ZOH)", value: "0 (vs 1,870 MPCC)", source: "report/sections/00_abstract.tex:25" }
  - { label: "Cross-phase significance", value: "Wilcoxon W=253, p=1.9e-5", source: "report/sections/06_conclusion.tex:106" }
role: Sole author (dissertation). Designed and built the RRHC controller, the MPCC/IPOPT baseline, the 3-DOF Fiala-tyre plant, the fairness-contract harness, and the five-phase statistical evaluation.
status: case-study
repo: { kind: private }
dates: "2025–26"
---

My final-year dissertation, *Fair Comparison of Racing Controllers: MPCC vs RRHC*. The headline
result: a hand-engineered reactive controller with no internal vehicle model and no online solver
laps a friction-limit racing plant **12.2% faster** than a model-predictive contouring controller
(MPCC) that solves a nonlinear program every step. It does it at 1/153 the per-step compute cost.
And with **zero deadline overruns**, where the MPCC blew its 20 ms budget 1,870 times over the
same trial.

The contribution is **RRHC**, a *Reactive Racing Heuristic Controller*. MPCC (a CasADi/IPOPT NLP)
is the optimisation baseline I built to beat. The interesting claim isn't "heuristics win"; it's
*when* and *why* they win, established under a contract that makes the comparison actually fair.

## RRHC: four interpretable modules, no solver

RRHC computes steering and throttle in closed form each step. No horizon. Nothing is optimised
online, and there is no internal dynamics model. Four modules, each added to patch a concrete
failure mode of a single-loop pure-pursuit baseline, each carrying direct physical meaning:

- **Dual speed-dependent lookahead maps** — steering and throttle scan ahead on *separate*
  piecewise-linear lookahead curves (normalised speed → distance). Decoupling them lets the speed
  planner look further down the track than the lateral controller without destabilising steering.
- **d²κ/ds²-weighted racing-line offset** — the key idea. Track curvature κ(s) is signed; its *second*
  derivative spikes exactly at the short transition zones where a straight blends into a corner.
  Those are the moments a human driver commits to an apex. I precompute a d²κ/ds² weight in [−1, 1]
  (Gaussian dilation of the peaks → power-law compression → 95th-percentile normalisation →
  smoothing) and use it to shift the steering target toward the inside *before* the corner
  tightens, not after the car is already in it.
- **tanh speed envelope with boundary-blended lookahead** — target speed comes from the *angular
  misalignment* between heading and a lookahead throttle target (a weighted blend of centreline and
  boundary points ahead). Aligned heading → V_max; diverging into a corner → base speed. Implicit
  speed regulation, with no curvature-based braking maths and no velocity profiling.
- **Steering-proportional throttle gate** — positive force is scaled by `1 − tanh²(k·|δ|)`, which kills
  acceleration mid-corner and only opens full throttle when the wheel is centred. Braking bypasses
  the gate. This closed the last gap once friction-circle coupling started limiting corner-exit
  accel.

One pass through the modules per control step:

```text
 track arrays (s, x, y, kappa(s), half-width)
          |                     |
          v                     v
  STEERING PATH           THROTTLE PATH
  d2kappa/ds2 apex        lookahead L_th(v);
  weight in [-1, 1]       blend centreline +
  (dilate > compress      boundary points
   > p95 > smooth)              |
          |                     v
          v               heading misalignment
  line offset +           -> tanh envelope:
  lookahead L_st(v)       aligned -> V_max
          |               corner -> base speed
          v                     |
  pure-pursuit delta            v
          |               throttle gate:
          +-- |delta| --> 1 - tanh^2(k|delta|)
          |               (braking bypasses)
          v                     |
       steering                 v
                          throttle force
```
*Fig. 1 — one RRHC control step: precomputed track annotation feeds two decoupled lookahead paths, and the steering angle gates the throttle.*

All track lookups are vectorised `np.interp` over arc-length arrays extended for periodic
wrapping. That is how the whole controller runs in **0.13 ms/step mean** (0.16 ms P99, 0.20 ms
max).

## The MPCC baseline I had to beat

The MPCC is a genuine optimisation controller, not a strawman: a CasADi-symbolic NLP over a
28-stage horizon (stage dt ≈ 102 ms, giving ~2.86 s lookahead; the controller re-solves every
20 ms at 50 Hz) solved by IPOPT each step, with:

- Contouring + lag cost against a B-spline track parameterisation, plus a progress reward on the
  virtual arc-length input v_θ and a coupling penalty tying v_θ to vehicle speed (stops the solver
  "cheating" progress).
- A friction-circle (GG) constraint `a² + (v²·tanδ/L)² ≤ (β·μ·g)²` at every stage, plus a tube
  constraint keeping the predicted path inside the track half-width.
- Primal + dual warm-starting: each solve seeds IPOPT with the previous solution's states, inputs
  *and* Lagrange multipliers (`lam_x`, `lam_g`), shifted one step (receding horizon). This is what
  makes per-step re-solves tractable.
- CasADi JIT compilation of the NLP to C (`-O2`), with a fall-back to interpreted mode if the
  shell compiler is unavailable.

The honest, load-bearing design decision: the MPCC's internal model is a kinematic bicycle, while
the simulator plant is a dynamic 3-DOF Fiala-tyre model. That mismatch is deliberate. A full
dynamic-model MPCC would not fit the 20 ms control budget, so the deployed MPCC pays a steady
model-mismatch penalty against the plant. The dissertation's central framing is that this isn't
"MPC vs heuristics" but *model accuracy vs engineering effort*: where the model can never be
exact, the effort that produced RRHC converts directly into robustness margin.

Two failure modes I had to engineer around, both documented in code: the tube constraint is
skipped at k=0, because pinning the current (possibly off-track, on-kerb) position guaranteed
infeasibility; and IPOPT's warm-start is updated even on solver failure, because its best iterate
beats stale data that otherwise cascades into drift.

## The shared plant: correctness proven, not assumed

Both controllers drive an identical 3-DOF planar bicycle with a Fiala lateral-tyre model and
per-axle friction-ellipse coupling. The physics is the part where sign conventions silently kill
you, so it's the part I made provable:

- Stiff integration: `solve_ivp(method="Radau")` (implicit, A-stable) for the tyre nonlinearities
  and combined-slip transitions, with an automatic LSODA fall-back and a hard error if both fail.
- Slip-angle signs: a wrong front/rear slip-angle formula produces a positive eigenvalue and the
  car spins. The conventions are pinned down in a dedicated explanation doc and guarded by tests.
- Standstill correctness: a per-axle contact-patch speed fade keeps tyre forces alive under yaw at
  near-zero CG speed (so the car can damp a spin) while going to exactly zero at true standstill,
  and a C-∞ smooth brake-fade keeps the Radau Jacobian kink-free.

The repo carries 201 test functions across plant torture tests (T1–T21), controller,
track-annotation, metrics, optimisation and contract suites.

## The fairness contract — why the comparison stands

A controller comparison is worthless if the two sides got different conditions. So the harness
enforces fairness at three layers. **PreFlight** validates identical initial conditions, plant
parameters and track data before a run. A **RuntimeWatchdog** wraps each controller; if an `act()`
call exceeds its wall-clock budget, it records a zero-order-hold (ZOH) event and re-issues the
previous command, so a controller that misses its deadline is *penalised in the dynamics*, not
silently allowed to think longer. A **PostHoc** auditor confirms timing compliance afterwards. Every
reported run carries a FAIR/UNFAIR verdict.

```text
 +-----------+   +----------------------+   +-----------+
 | PreFlight |   | run loop @ 50 Hz     |   | PostHoc   |
 | identical |-->| act() wrapped by     |-->| auditor:  |
 | ICs/plant |   | RuntimeWatchdog;     |   | timing    |
 | /track    |   | late? -> log ZOH,    |   | audit     |
 +-----------+   | re-issue last cmd    |   +-----+-----+
                 +----------------------+         |
                                                  v
                                           FAIR / UNFAIR
```
*Fig. 2 — the three-layer fairness harness: a late act() call is penalised in the dynamics via zero-order hold, and every run gets a verdict.*

This is what makes the compute result more than a microbenchmark. The MPCC's 19.88 ms mean is
right on its 20 ms deadline, its P99 is 114.8 ms and its max is 189.7 ms, and the watchdog logged
a 20% ZOH rate. The MPCC is *literally missing control deadlines* on this plant, and the contract
makes that cost visible in lap time.

```text
            0 ms                            20 ms deadline
            |                               |
 RRHC mean  | 0.13                          |
 RRHC max   | 0.20                          |
 MPCC mean  |###############################| 19.88
 MPCC P99   |###############################|>>> 114.8
 MPCC max   |###############################|>>> 189.7
            |                               |
 ZOH events over the trial: MPCC 1,870 (20%), RRHC 0
```
*Fig. 3 — per-step wall clock against the shared 20 ms deadline; RRHC's bars are too small to draw at this scale, and MPCC's P99 and max run off the right edge.*

## Five-phase evaluation and an honest trade-off

I didn't report one lap time on one track. Five phases: baseline, compute, control-frequency
sensitivity, robustness (noise / actuator delay / model mismatch / unseen tracks / drivetrain
transfer), and tuning complexity, each with proper statistics (paired Wilcoxon, Mann-Whitney,
bootstrap CIs, and a Saltelli/Sobol global sensitivity analysis with all total-order indices < 1).

The result is a genuine trade-off, not a one-sided win:

| | RRHC | MPCC |
|---|---|---|
| 3-lap time | **164.2 s** | 187.1 s |
| Mean solve time | **0.13 ms** | 19.88 ms |
| Min viable control freq | **10 Hz** | 20 Hz |
| Model-mismatch survival | **6/6** | 3/6 |
| Unseen-track completion | 80% | **100%** |
| 1-step actuator-delay tolerance | 1 | **2** |

RRHC wins on raw speed, compute, and robustness to model error; MPCC's predictive horizon wins on
actuator-delay tolerance and generalisation to unseen tracks. The cross-phase advantage is
significant (22/22 conditions, Wilcoxon W = 253, p = 1.9×10⁻⁵, bootstrap 95% CI [12.4%, 14.0%]).

## Honest scope

Simulation only — no sim-to-real validation. RRHC offers no formal guarantees: unlike MPC it
can't certify constraint satisfaction, only demonstrate it empirically. The "oracle"/DDP
controller in the tree is a placeholder stub returning zero commands, not a third evaluated
baseline; the real comparison is strictly RRHC vs MPCC. And RRHC's three clear losses (actuator
delay; chicane-heavy unseen tracks; FWD drivetrain transfer, where RRHC departs the track at
30.7 s while MPCC completes all three drivetrain configs) are attributed to specific architectural
properties (no prediction horizon; tanh-envelope LAT oscillation when the lookahead target swaps
boundaries rapidly; steering-proportional throttle gate failing to account for axle-specific force
budgets under front-axle-only drive), each with a concrete proposed fix rather than a hand-wave.
