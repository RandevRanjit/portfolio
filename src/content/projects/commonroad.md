---
title: velox — CommonRoad C++ Port
tagline: ~10.6k LOC C++20 port of the CommonRoad vehicle models (ST / STD / MB) into a reusable static library, `velox`, behind one daemon-style API — derivative outputs matched against the Python reference to 1e-13, plus a ~4.5k LOC TypeScript SDK whose JS backend is parity-checked field-by-field against the native one.
order: 10
section: motorsport
lineage:
  - { note: "velox is embedded into the FSAI driverless stack as its physics core", slug: fsai-sim }
buckets: [systems, control]
stack: ["C++20", CMake, TypeScript, Python, YAML, "SDL2/ImGui"]
metrics:
  - { label: "Codebase", value: "~10.6k LOC C++", source: "velox: wc -l over lib/app/examples/tests/parameters = 10,642, and web-sdk *.ts = 4,491, re-measured 2026-09-11" }
  - { label: "Selectable models", value: "ST / STD / MB (29-state)", source: "velox: lib/simulation/model_timing.hpp:9-13, lib/models/vehiclemodels/src/vehicle_dynamics_mb.cpp:20, checked 2026-09-11" }
  - { label: "Derivative parity vs Python", value: "ST/STD 1e-13, MB 1e-7", source: "velox: tests/test_derivatives.cpp:84,114,184, checked 2026-09-11" }
  - { label: "Test suite", value: "19 CTest targets", source: "velox: grep -c add_test CMakeLists.txt = 19; tests/test_*.cpp+py = 19 files, re-measured 2026-09-11" }
role: Sole author. Ported the CommonRoad ST/STD/MB vehicle models from the academic Python reference to a C++20 static library (`velox`), built the `SimulationDaemon` API with a `ModelTiming` sub-step scheduler, Pacejka tyre model, EV powertrain controller, staged low-speed/loss-of-control safety, and a TypeScript web SDK with a JS backend parity-checked against the native one.
status: archived
repo: { kind: public, url: "https://github.com/RandevRanjit/CommonRoad-CXX-Port" }
dates: "2025"
---

A C++20 port of the CommonRoad vehicle-dynamics library into a reusable static library (`velox`),
exposed through a single `SimulationDaemon` API and then re-implemented in TypeScript. The ported
maths is checked numerically against the original Python at every layer.

The packaging is the point as much as the port is. The build produces `velox` — a static library
containing the daemon, controllers, telemetry and utility code — and everything else in the repo
(the SDL2/ImGui viewer, the `basic_sim_daemon` sample, the `drift_mode_demo` headless check) is a
*consumer* of that library rather than part of it. That is what lets the same physics drop into
the FSAI driverless stack and into a browser without being rewritten.

## What was actually ported

CommonRoad ships its vehicle models as academic Python — a copy of which lives in `PYTHON/`
alongside the port, so the reference and the port can be diffed. I ported the three selectable
models into C++20 (`ModelType{ST, STD, MB}`):

- **ST** — dynamic single-track, 7 states. A linearised bicycle whose cornering stiffnesses
  `C_Sf/C_Sr` are derived from the tyre's Pacejka coefficients.
- **STD** — single-track drift, same chassis but with the full Pacejka Magic Formula tyre
  (pure-longitudinal, pure-lateral, and combined-slip variants in `tire_model.cpp`) so the model
  holds up under oversteer.
- **MB** — a **29-state multi-body model**: global pose, per-axle roll/pitch/heave, suspension
  travel, and individual wheel spin. This is the hard one. The state vector and force coupling are
  long enough that a transcription slip stays invisible until the derivative is wrong in the 12th
  digit.

A fourth routine, `vehicle_dynamics_ks_cog` (kinematic single-track about the CoG), is not a
selectable model. It is a shared internal helper that ST, STD, and MB all fall back to at low
speed (see below).

## Correctness is proven, not assumed

`tests/test_derivatives.cpp` is the spine of the port. It feeds fixed states and inputs into the
C++ ST, STD, and MB derivative functions and compares each output element against the ground-truth
vectors transcribed from the reference Python unit tests (`PYTHON/unit_tests/test_derivatives.py`):

- **ST and STD agree to `1e-13`**, effectively bit-for-bit with the reference.
- **MB agrees to `1e-7`** across all 29 derivative components. The looser bound is accumulated
  floating-point error over a far longer computation, not a modelling difference.

Scaled by how many decimal places actually match, the gap between the two bounds looks like this:

```text
matching decimal places vs the Python ground truth

ST   (7 states)   #############  13   (tol 1e-13)
STD  (7 states)   #############  13   (tol 1e-13)
MB   (29 states)  #######         7   (tol 1e-7)
```
*Fig. 1 — derivative parity per model, from the tolerances asserted in tests/test_derivatives.cpp.*

That is the claim the whole project rests on: the C++ isn't "close to" the academic model, it
*is* the academic model. 19 test files and 19 CTest targets back it — derivatives, zero-velocity
edge cases, timestep bounds, the steering controller, low-speed safety, telemetry population and
drift toggling, plus a cross-language scenario-consistency check driven from Python.

## The near-zero-speed singularity

The dynamic single-track equations divide by `vx` (terms like `mu·m/(vx·I·…)`), so they blow up as
the car approaches rest. The fix, faithful to the reference, is in `vehicle_dynamics_st.cpp:49`:
when `|x[3]| < 0.1` m/s (`x[3]` is `vx`), the model switches to the kinematic single-track solution
and hand-computes the yaw-rate and slip-angle derivatives from `tan(δ)` geometry instead. The
transition is continuous because both branches return the same 7-element derivative and integrator
state is preserved across `SimulationDaemon::reset`. STD and MB share the same guard. Naive ports
miss this and produce NaNs the moment the vehicle stops.

## The daemon and the sub-step scheduler

Everything sits behind one `SimulationDaemon`: it owns the chosen model, the steering and
longitudinal controllers, the safety system, and the integrator, and exposes `step(UserInput) →
SimulationTelemetry`. Callers pass whatever `dt` their frame loop produces; the daemon decides how
to integrate it. `reset(ResetParams)` swaps models or vehicles in place while preserving the
configured parameter roots, so a host can switch from a 7-state to a 29-state model at runtime
without tearing anything down.

That decision is `ModelTiming::plan_steps`. Each model declares a `max_dt`. A requested step larger
than that is split into N equal sub-steps, so the integrator never takes a stride wide enough to go
unstable, and any `dt` below `kMinStableDt = 1 ms` is clamped up (with the clamp surfaced in
telemetry). The scheduler also refuses to create sub-steps thinner than the stable minimum, so a
huge requested `dt` won't generate thousands of useless micro-steps. The result: a wobbly,
variable host frame rate can't destabilise the physics.

```text
 UserInput + host dt (whatever the frame loop gives)
        |
        v
+--------------- SimulationDaemon ---------------+
|                                                |
|  ModelTiming::plan_steps                       |
|    dt < kMinStableDt (1 ms) -> clamp up, flag  |
|    dt > model max_dt        -> N equal         |
|                                sub-steps       |
|         |                                      |
|         v   per sub-step                       |
|  controllers -> model (ST/STD/MB) -> integrate |
|  safety: detector + staged controller          |
|                                                |
+------------------------------------------------+
        |
        v
 SimulationTelemetry snapshot
```
*Fig. 2 — one daemon step: the scheduler conditions the host dt before any physics runs.*

## Powertrain, controllers, telemetry

The longitudinal path is a full controller stack, not a single gain: a `FinalAccelController` that
blends throttle/brake, an EV `Powertrain` with state-of-charge tracking, regen torque, power
limits, and SOC limits, plus aero and rolling-resistance models. Every step emits a structured
`SimulationTelemetry` snapshot: pose, body-frame velocities, slip and lateral-force saturation,
steering desired-vs-actual, powertrain drive/regen/SOC, per-axle wheel torques and friction use,
and cumulative distance/energy. `to_json` serialises it; an ImGui panel renders it.

## Staged safety, not a single clamp

Two cooperating systems keep the models stable and honest. A loss-of-control detector scores
yaw rate, slip angle, lateral acceleration, and per-wheel slip ratio against both magnitude and
rate-of-change thresholds, returning the worst normalised severity. A staged low-speed safety
controller then moves through `normal → transition → emergency`: severity above 1.0 latches the
emergency stage until speed recovers, with blending between the engage/release bands so dynamics
ease back to nominal rather than snapping. Drift-capable models load a looser profile by default;
others opt in via init/reset params or a runtime `UserInput::drift_toggle`. Thresholds live in
per-model YAML, so retuning never touches code.

```text
severity = worst normalised score over yaw rate,
slip angle, lat accel, per-wheel slip (level + rate)

+--------+  severity rises   +------------+
| normal | ----------------> | transition |
+--------+   (blends in)     +------------+
     ^                             |
     | speed recovers              |  severity > 1.0
     |  (blends out)               v  (latches)
     |                       +-----------+
     +---------------------- | emergency |
                             +-----------+
```
*Fig. 3 — the staged safety controller; severity above 1.0 latches emergency until speed recovers.*

`reports/low_speed_launch_bug.md` documents where this honesty shows: pinning lateral states to
zero under full steering lock makes the tyres fight the engine, trapping the car at ~0.2–0.3 m/s.
The report traces it to the latch and proposes projecting onto the kinematic reference instead.
A real diagnostic, not a glossy claim.

## Two implementations, checked against each other

The model was then re-implemented in ~4.5k LOC of TypeScript (`web-sdk/`) so it can run in the
browser. The SDK mirrors the C++ structure (daemon, models, Pacejka tyre, controllers, safety,
telemetry) behind two interchangeable backends: a pure-JS `JsSimulationBackend` and a binding to
the native C++ build. `tools/compareNative.ts` drives both through the same scenario fixtures,
flattens every telemetry field, and reports per-field RMSE and max-abs-diff against configurable
tolerances, flagging any field that drifts past its bound. So the port's correctness isn't
asserted once at the bottom. It's measured across the language boundary too. That SDK is the
version that ended up embedded in a browser playground for the racing-controller write-up.

_The transferable skill: reading a non-trivial academic codebase, porting it faithfully, and
proving numerically, against the source, that the port behaves identically. Twice, in two
languages._

## Honest scope

Finished in November 2025 and not touched since — a completed library, not an active project.
Two caveats on the test claim above: of the 19 CTest targets, two are not unit tests
(`drift_mode_demo` is an example binary used as a headless CI check, `scenario_consistency` is a
Python cross-check), and `tests/test_loss_of_control_detector.cpp` exists in the tree but is never
registered with `add_test`, so it doesn't run in CI. There are no benchmark or timing numbers for
the library — `kMinStableDt` is a stability bound, not a measured budget. And the TypeScript
parity harness compares the JS backend against the native one; it does not re-run the Python
reference, so the 1e-13 claim is anchored at the C++ layer only.
