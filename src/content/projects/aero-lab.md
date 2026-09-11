---
title: Aero-Lab — Quadrotor Flight Sim
tagline: Hand-rolled 6-DOF quadrotor dynamics plus four racing controllers — PID, MPCC (acados SQP-RTI), a solver-free RRHC, and a PPO policy — compared under a machine-enforced fairness contract, with the RRHC now re-ported to deterministic bare-metal C as declared prior work for a TU Delft MSc.
order: 3
section: drones
lineage:
  - { note: "RRHC — the interpretable racing controller — was invented in this dissertation project", slug: racing-lab }
buckets: [control]
stack: [Python, NumPy, SciPy, acados, CasADi, Gymnasium, stable-baselines3, C, VisPy]
metrics:
  - { label: "Tests", value: "381 tests", source: "aero-lab: grep -rc 'def test_' tests → 381 test functions across 35 files (2026-09-11)" }
  - { label: "Controllers", value: "8 registered", source: "aero-lab: src/aerolab/controllers/factory.py:60-69 CONTROLLER_REGISTRY — 4 racing + 4 AUBRY (2026-09-11)" }
  - { label: "RRHC vs MPCC", value: "~22x less compute", source: "aero-lab: docs/reference/benchmark-results.md — matched default configs, 0.14 s vs 3.17 s wall-clock per lap (measured 2026-07-08)" }
  - { label: "C port vs Python", value: "max |Δω| 1.4e-12 rad/s", source: "aero-lab: thesis/wp2-rrhc-port/README.md — Stage B float port replayed against a 643-tick golden trace (2026-07-08)" }
  - { label: "Code", value: "~9.0k src LOC", source: "aero-lab: git ls-files 'src/*.py' | xargs wc -l → 9,038 src + 7,303 tests (2026-09-11)" }
role: Sole author. Hand-rolled the 6-DOF rigid-body dynamics (RK4, motor lag, gyroscopic torque, drag), the analytic differential-flatness inner loop shared by every controller, an acados SQP-RTI MPCC, a CTBR PPO env + policy, and a fairness contract (pre-flight + watchdog + post-hoc audit) that enforces identical plant, course, and control rate across all controllers. Since July 2026 also the offline table-bake and bare-metal C reimplementation of the RRHC, validated bit-close against the Python reference.
status: working
repo: { kind: private }
dates: "2026"
---

A quadrotor flight simulator with no physics library, four racing controllers raced head-to-head on
the same plant, and — since July — a bare-metal C reimplementation of the cheapest one. The point
isn't any single controller. It's the apparatus: a 6-DOF quad I integrate myself, a shared analytic
inner loop, and a fairness harness that makes "controller A beats controller B" a claim you can
actually check. **381 test functions across 35 files.**

The repo now splits explicitly into two tracks (`ROUTES.md`): the racing research documented here,
which has become declared prior work for a TU Delft CESE MSc, and **AUBRY**, the camera-drone track
that reuses the same inner loop without touching the racing controllers.

## The plant: 6-DOF, RK4, hand-derived

State is 17-dimensional: position, a `[w,x,y,z]` quaternion, body velocity, body rates, and four
rotor speeds. Translational and rotational dynamics integrate with 4th-order Runge–Kutta; motor lag
is a first-order Euler update with time constant τ. I derive the rotational dynamics from Euler's
equation with the gyroscopic cross-term recomputed *inside* the RK4 derivative, so the precession torque
is consistent at every stage rather than frozen at the step boundary. The quaternion derivative is
`q̇ = ½ q ⊗ [0, ω]`, renormalised after each step. The default airframe is a real 5-inch FPV quad (650 g,
226 mm wheelbase), with thrust/torque/inertia/drag coefficients each traced to a cited source
(MQTB bench data, Foehn et al. *Science Robotics* 2021, an ENAC drag study).

The mixer is a 4×4 matrix mapping squared rotor speeds to the wrench `[T, τx, τy, τz]`; its inverse
recovers per-motor RPM from a desired thrust + torque. It's the same allocation PX4/Betaflight
firmware run, built once and reused by every controller.

## One inner loop, four outer loops

Quadrotors are **differentially flat** in (x, y, z, yaw): given a desired acceleration and yaw, you can
solve thrust and attitude *analytically*. No optimiser. That flatness map is the spine of the whole
project. `compute_thrust_attitude` builds the body frame from the thrust direction and converts to a
quaternion via Shepperd's method, and every controller plugs into the same attitude-PD → rate-P → mixer
chain after it. So the controllers differ only in how they choose the desired acceleration, which is
exactly what makes the comparison fair. The hot path is hand-rolled scalar maths (manual cross products,
`math.sqrt` norms) instead of `np.cross`/`np.linalg.norm`, because it runs every tick.

The four ways to pick that acceleration:

- **PID + DFBC** — Mellinger & Kumar (ICRA 2011) cascaded position-PD with velocity feedforward, so the
  drone flies *through* gates at a cruise speed instead of stopping at each.
- **MPCC** — Model Predictive Contouring Control (Romero et al., T-RO 2022). I migrated the original
  CasADi/IPOPT formulation to an acados SQP-RTI solver: one real-time iteration per tick (HPIPM +
  partial condensing), with the cost written as a `NONLINEAR_LS` residual so the Gauss-Newton Hessian
  is PSD by construction and the QP never stalls on large weights. Compiled solvers are cached on disk
  keyed by a geometry hash. Gate-following falls out of the contouring cost on a racing line that threads
  the gates; no Gaussian checkpoint scheduling. On solver failure it holds the last good acceleration
  for up to 3 ticks before dropping to a PD fallback. The legacy IPOPT backend is still selectable
  for comparison.
- **RRHC** — a solver-free controller carried over from my dissertation and adapted to 3D. Two
  speed-scaled look-ahead points on an offset racing line drive a desired-velocity field; the *long*
  look-ahead diverges from the heading before a corner, which is the sole pre-braking mechanism (the
  old curvature speed clamp was removed in May 2026 — it cost lap time). No internal model, no online
  optimisation, pure NumPy. The canonical expansion is now *Reactive Racing Heuristic Controller*; the
  in-code docstrings still carry an older "receding horizon" wording that the repo flags as a
  deliberate, un-renamed inconsistency in the frozen racing path.
- **RL** — a PPO policy (stable-baselines3) trained via a 3-stage curriculum for ~7M total timesteps
  (1.5M on 2-gate, 2.5M on 4-gate, 3M on benchmark) in a Gymnasium env. It commands a normalised
  collective-thrust + body-rate (CTBR) action, *not* raw motor speeds: the thrust channel is
  hover-centred so the policy gets resolution where it matters, and it shares the same rate loop + mixer
  as everything else. It is parked, and not part of the head-to-head benchmark.

The whole chain, with the RL arm joining at the rate loop:

```text
+--------+  +--------+  +--------+        +--------+
|  PID   |  |  MPCC  |  |  RRHC  |        |   RL   |
|  DFBC  |  | SQP-RTI|  | NumPy  |        |  PPO   |
+---+----+  +---+----+  +---+----+        +---+----+
    | a_des     | a_des     | a_des           | CTBR
    +-----------+-----------+                 |
                |                             |
                v                             |
   [ flatness map: a_des + yaw ]              |
   [    -> thrust + attitude   ]              |
                |                             |
                v                             |
          attitude PD                         |
                |                             |
                +<----------------------------+
                |
                v
     [ rate P -> 4x4 mixer -> rotor RPM ]
                |
                v
   [ 6-DOF plant: RK4 + 17 states   ]
   [ motor lag + gyro torque + drag ]
```
*Fig. 1 — one shared inner loop; the four controllers differ only in the command they feed it.*

## Proving the comparison is fair

Cross-controller benchmarks are easy to fake. Quietly give one a finer timestep or a longer compute
budget, or just tune it harder. So fairness is machine-enforced, defined once in a `FairnessConfig`:
identical control rate (50 Hz, `control_dt = 0.02 s`), identical plant hash, identical course hash, a
per-tick compute budget (50 ms by default), and a cap on how many steps may be zero-order-held (5%).
A pre-flight validator refuses to start a session whose configs disagree. A runtime watchdog wraps each
controller and ZOH-holds any tick that blows its budget. A post-hoc auditor verifies the constraints
held. That harness is its own test module — 13 tests, T-CON-1…13. The contract and its three checks:

```text
   FairnessConfig:
     50 Hz control rate / plant hash / course hash
     per-tick compute budget / ZOH-step cap
              |
              v
   [ pre-flight validator ]
     refuses to start if session configs disagree
              |
              v
   [ runtime watchdog ]
     ZOH-holds any tick that blows its budget
              |
              v
   [ post-hoc auditor ]
     verifies the contract held for the whole run
```
*Fig. 2 — the fairness contract, checked before, during, and after every session.*

## Results, and the number I had to retract

The headline used to be "RRHC 9.82 s vs MPCC 11.04 s — the heuristic beats the optimiser." An
evidence-hardening pass in July 2026 killed that framing, and I'd rather show the correction than the
old number. 9.82 s is RRHC's *benchmark-overfit* tune (Vmax ≈ 13 m/s); it doesn't generalise, and the
MPCC side of that pair isn't reproducible from the race scripts at all, because `race_mpcc.py` has no
`--config` flag. So the comparison was never like-for-like.

Re-measured on 2026-07-08, at **matched default configs** on the 6-gate benchmark course
(`docs/reference/benchmark-results.md`, which now ships the exact reproduce commands because `runs/`
is gitignored):

- **RRHC 12.86 s, MPCC 12.38 s — both 6/6 gates.** The optimiser is half a second quicker. The
  solver-free controller is not faster; it is *level*.
- RRHC burns **0.14 s of wall-clock compute** for that lap against MPCC's **3.17 s** — **~22× cheaper**.
  That is the claim worth defending: matched lap time at a twentieth of the compute, with no NLP in the
  loop at all.
- These are pure-Python physics numbers (`QuadrotorDynamics`, RK4), stated as such in the doc. Single
  run per controller; an N≥10 + unseen-course protocol is still outstanding.

```text
 benchmark course, 6 gates, matched default configs

 lap time (sim)
 MPCC  #####################################    12.38 s   6/6
 RRHC  ######################################   12.86 s   6/6

 wall-clock compute spent on that lap
 MPCC  ######################################   3.17 s
 RRHC  ##                                       0.14 s
       (~22x cheaper for RRHC)
```
*Fig. 3 — matched-config lap times are within half a second; the compute gap is the real result.*

An earlier 12-course tuned sweep (May 2026) has RRHC fastest on all 10 completable courses and a 162×
median per-tick compute advantage over MPCC, with a tight oval and a figure-8 defeating every
controller. I still believe that sweep, but it lives in `runs/`, which is gitignored, so a fresh clone
can't reproduce it — I'm treating it as supporting evidence, not the headline.

## Porting the winner to bare metal

The MSc this feeds into is about determinism on a Zynq UltraScale+, with the controller running
bare-metal on a Cortex-R5F while an FPGA gate-detector contends for the same DDR controller. So the
RRHC had to leave Python. The port works because the per-tick hot path was already refactored into
pure uniform-grid table lookups — every spline, SciPy call, and Gaussian filter happens once, at
construction:

```text
  offline, on the host (Python)        on target (C, bare metal)
  -----------------------------        -------------------------
  build the offset racing line         per tick:
  bake 7 arc-length tables on one        closest_s  (windowed arg-min)
  0.05 m grid (M = 1443) + every         advance    ((s+ds) mod total)
  runtime constant                       offset_point / tangent (lerp)
        |                                speed graph (tanh^2)
        v                                velocity field
  const C header: rrhc_gen.h             flatness -> att-PD -> rate-P -> mixer
  (read-only memory, no malloc,                |
   no libm spline eval)                        v
        |                                 motor speeds
        +------------> replay 643 golden ticks ------+
                 max |dw| = 1.4e-12 rad/s, s drift 0.000 m
```
*Fig. 4 — the split that makes the port deterministic: all construction offline, only table lookups on target.*

Stage A (harness + golden-vector capture) and Stage B (full `double` C port) are done and validated
bit-close against the Python reference. Stage C — fixed-point Qm.n, static allocation, no libm, with a
per-signal quantisation-error budget — is the actual R5F-ready deliverable and is not built yet. The
Python racing path was not modified to make any of this work; that's a standing invariant in the repo.

## Honest scope

The default plant runs on pure-Python RK4, and every benchmark number above is from that path. The
optional C++ backend (Flightmare's flightlib via pybind11) does now integrate the physics for real —
the earlier state-propagation failure is fixed, with a workaround for an unreliable pybind11 `Ref<>`
write-back that reads state back explicitly via `getObsNumpy()`. But the "lap times translate within
2% across backends" claim is prose-only in the devlog with no captured artefact, and the repo's own
evidence doc marks it **unverified**, so I'm not standing behind it here.

The RRHC control law is ported from my dissertation's 2D car project; the work here is carrying it onto
a 3D quad, pitting it against a real acados MPCC under one enforced contract, and now taking it down to
deterministic C. The in-tree `optimize/` module is still a stub that raises `NotImplementedError` —
tuning lives in standalone Optuna scripts. The RL policy is trained but parked and absent from the
benchmark. The MSc plan in `docs/thesis/` is a plan, not a result: no FPGA hardware has been touched,
and every figure in it is provisional until a supervisor confirms it. A separate AUBRY track reuses the
same inner loop for camera-drone work and is the actively-growing edge of the repo.
