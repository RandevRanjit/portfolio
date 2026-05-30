---
title: Aero-Lab — Quadrotor Flight Sim
tagline: Hand-rolled 6-DOF quadrotor dynamics plus four racing controllers — PID, MPCC (acados SQP-RTI), a reactive RRHC, and a PPO policy — with PID/MPCC/RRHC benchmarked head-to-head on a 12-course fairness harness.
order: 3
buckets: [control]
spokes:
  - { id: drone, role: flagship, blurb: "A full quadrotor stack: physics, four controllers, a Gymnasium racing env, and a 12-course benchmark harness — 357 tests passing." }
  - { id: motorsport, role: secondary, blurb: "Carries the dissertation's RRHC controller onto a 3D quad and beats an online-NLP MPCC on lap time at ~1/162 the compute." }
stack: [Python, NumPy, SciPy, acados, CasADi, Gymnasium, stable-baselines3, Optuna, VisPy]
metrics:
  - { label: "Tests", value: "357 tests", source: "aero-lab: pytest tests/ — 357 passed, 4 skipped, 1 xfailed" }
  - { label: "Controllers", value: "6 controllers", source: "aero-lab: src/aerolab/controllers/{pid_dfbc,mpcc,rrhc,rl,aubry}" }
  - { label: "RRHC vs MPCC", value: "162x cheaper/tick", source: "aero-lab: runs/telemetry_tuned/results.md" }
  - { label: "Code", value: "~8.5k src LOC", source: "aero-lab: wc -l src/ tests/" }
role: Sole author. Hand-rolled the 6-DOF rigid-body dynamics (RK4, motor lag, gyroscopic torque, drag), the analytic differential-flatness inner loop shared by every controller, an acados SQP-RTI MPCC, a CTBR PPO env + policy, and a fairness contract (pre-flight + watchdog + post-hoc audit) that enforces identical plant, course, and control rate across all controllers.
status: working
repo: { kind: private }
dates: "2026"
---

A quadrotor flight simulator with **no physics library** and **four full racing controllers** raced
head-to-head on the same plant. The point isn't any one controller — it's the apparatus: a 6-DOF quad I
integrate myself, a shared analytic inner loop, and a fairness harness that makes "controller A beats
controller B" a claim you can actually trust. **357 tests pass.**

## The plant: 6-DOF, RK4, hand-derived

State is 17-dimensional — position, a `[w,x,y,z]` quaternion, body velocity, body rates, and four
rotor speeds. Translational and rotational dynamics integrate with **4th-order Runge–Kutta**; motor lag
is a first-order Euler update with time constant τ. I derive the rotational dynamics from Euler's
equation with the gyroscopic cross-term recomputed *inside* the RK4 derivative so the precession torque
is consistent at every stage, not frozen at the step boundary. The quaternion derivative is
`q̇ = ½ q ⊗ [0, ω]`, renormalised after each step. The default airframe is a real 5-inch FPV quad (650 g,
226 mm wheelbase), with thrust/torque/inertia/drag coefficients each traced to a cited source
(MQTB bench data, Foehn et al. *Science Robotics* 2021, an ENAC drag study) rather than guessed.

The **mixer** is a 4×4 matrix mapping squared rotor speeds to the wrench `[T, τx, τy, τz]`; its inverse
recovers per-motor RPM from a desired thrust + torque — the same allocation PX4/Betaflight firmware run,
built once and reused by every controller.

## One inner loop, four outer loops

Quadrotors are **differentially flat** in (x, y, z, yaw): given a desired acceleration and yaw, you can
solve thrust and attitude *analytically*, no optimiser. That flatness map is the spine of the whole
project — `compute_thrust_attitude` builds the body frame from the thrust direction, converts to a
quaternion via Shepperd's method, and every controller plugs into the same attitude-PD → rate-P → mixer
chain after it. So the controllers differ **only in how they choose the desired acceleration**, which is
exactly what makes the comparison fair. The hot path is hand-rolled scalar maths (manual cross products,
`math.sqrt` norms) instead of `np.cross`/`np.linalg.norm`, because it runs every tick — roughly 10× cheaper per call.

The four ways to pick that acceleration:

- **PID + DFBC** — Mellinger & Kumar (ICRA 2011) cascaded position-PD with velocity feedforward, so the
  drone flies *through* gates at a cruise speed instead of stopping at each.
- **MPCC** — Model Predictive Contouring Control (Romero et al., T-RO 2022). I migrated the original
  CasADi/IPOPT formulation to an **acados SQP-RTI** solver: one real-time iteration per tick (HPIPM +
  partial condensing) — ~13.5 ms median per tick on this hardware — with compiled solvers cached on disk
  keyed by a geometry hash. Gate-following falls out of the contouring cost on a racing line that threads
  the gates — no Gaussian checkpoint scheduling. On solver failure it holds the last good acceleration for
  up to 3 ticks before dropping to a PD fallback.
- **RRHC** — a solver-free Receding-Horizon controller carried over from my dissertation and adapted to
  3D. Two speed-scaled look-ahead points on an offset racing line drive a desired-velocity field; the
  *long* look-ahead diverges from the heading before a corner, which is the sole pre-braking mechanism. No
  internal model, no online optimisation, pure NumPy.
- **RL** — a PPO policy (stable-baselines3) trained via a **3-stage curriculum for ~7M total timesteps** (1.5M on 2-gate, 2.5M on 4-gate, 3M on benchmark) in a Gymnasium env. It commands
  a normalised collective-thrust + body-rate (CTBR) action, *not* raw motor speeds — the thrust channel is
  hover-centred so the policy gets resolution where it matters, and it shares the same rate loop + mixer as
  everything else.

## Proving the comparison is fair

Cross-controller benchmarks are easy to fake — quietly give one a finer timestep, a longer compute
budget, or more tuning. So fairness is **machine-enforced**, defined once in a `FairnessConfig`: identical
control rate (50 Hz), identical plant hash, identical course hash, a per-tick compute budget, and a cap on
how many steps may be zero-order-held. A **pre-flight validator** refuses to start a session whose configs
disagree; a **runtime watchdog** wraps each controller and ZOH-holds any tick that blows its budget; a
**post-hoc auditor** verifies the constraints held. That harness is its own test module (T-CON-1…13).

## Results

On a 12-course benchmark (tuned per-controller via independent Optuna sweeps):

- **RRHC posts the fastest clean lap on all 10 completed courses** (2 of 12 are shared DNFs — oval and figure-8 defeat every controller), ahead of both MPCC and PID — e.g.
  9.82 s vs 11.04 s (MPCC) / 11.36 s (PID) on the benchmark track.
- **RRHC's median per-tick cost is 0.084 ms vs MPCC's 13.5 ms — ~162× cheaper** — while *beating* the
  online optimiser it's compared against. A model-free heuristic out-racing an NLP at a fraction of the
  compute is the headline finding the dissertation was built to defend, now reproduced on a full 6-DOF quad.
- All three deterministic controllers clear 10/12 courses; the two failures are a tight oval and a
  figure-8 that defeat every controller at the tuned speed ceiling — reported honestly as DNFs, not hidden.

## Honest scope

The plant runs on **pure-Python RK4**. There's an optional C++ backend (Flightmare's flightlib via
pybind11), but its `step()` doesn't propagate state through OpenMP/Eigen on macOS, so the bridge keeps the
C++ env for interface parity and integrates in Python — documented as a known issue, not papered over. The
RRHC control law is **ported from my dissertation's 2D car project**; the work here is carrying it onto a
3D quad and pitting it against a real acados MPCC under one fair contract (RL policy trained via curriculum but not yet in the head-to-head benchmark). The
in-tree `optimize/` module is still a stub — tuning currently lives in standalone Optuna scripts. A
separate **AUBRY** track (follow + cinematic framing controllers with APF obstacle avoidance) reuses the
same inner loop for camera-drone work and is the actively-growing edge of the repo.
