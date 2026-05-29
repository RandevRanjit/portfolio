---
title: CommonRoad C++ Port
tagline: ~11.6k LOC C++17 port of CommonRoad vehicle models (KS/ST/MB) as a clean static library with SimulationDaemon API and TypeScript web-sdk.
order: 10
buckets: [systems, control]
spokes:
  - { id: motorsport, role: secondary, blurb: "C++17 port of KS/ST/MB vehicle models — faithful to the academic Python reference, with a clean library API, sub-step scheduler, and telemetry." }
stack: ["C++17/20", CMake, Eigen, TypeScript]
metrics:
  - { label: "Codebase", value: "~11.6k LOC C++17", source: "audit §commonroad (measured 10,642 cpp/cc/h/hpp excl third_party)" }
  - { label: "Vehicle models", value: "KS / ST / MB", source: "audit §commonroad (lib/models/vehiclemodels)" }
  - { label: "ST kinematic fallback", value: "at |vx| < 0.1 m/s", source: "audit §commonroad (vehicle_dynamics_st.cpp:49-58)" }
role: Sole author. Ported the CommonRoad Python vehicle models (KS, ST, MB) to C++17, built the SimulationDaemon API with ModelTiming sub-step scheduler, telemetry layer, and a TypeScript web-sdk.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/CommonRoadCXXPort" }
dates: "2025"
---

A C++17 port of the CommonRoad vehicle model library — kinematic single-track (KS), single-track
with Fiala tire + Pacejka slip (ST), and multi-body (MB) — as a clean static library (`velox`)
with a `SimulationDaemon` API, a sub-step scheduler, and a TypeScript web-sdk layer.

The transfer from academic Python to production-style C++ requires faithfulness to the model maths
while adding the infrastructure a real system needs: **three fidelity tiers in one library** (KS
3-state, ST 7-state + Pacejka/Fiala, MB multi-body), one `SimulationDaemon` interface across all
three, and a `ModelTiming` sub-stepping scheduler (`kMinStableDt = 0.001f`, 1 ms min step) that
absorbs variable caller `dt` without numerical blowup.

**The ST kinematic fallback** at `|vx| < 0.1` m/s (`vehicle_dynamics_st.cpp:49–58`) is the correct
fix for the `tan(steer)/vx` singularity in the single-track model at near-zero speed — a genuine
numerical issue that naive ports miss. Integrator state is preserved through
`SimulationDaemon::reset` so transitions are seamless.

The staged low-speed safety pipeline (normal/drift, toggled live via `UserInput::drift_toggle`)
and the full telemetry schema (daemon lifecycle, error types, build instructions) in the README
frame this as a finished deliverable rather than coursework.

_Demonstrates reading and porting a non-trivial academic codebase to production-style C++ — the
same skill as taking an academic vehicle-dynamics paper and turning it into an engineered library._
