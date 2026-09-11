---
title: FSAI Unity Driving Simulator
tagline: An earlier Unity/C# Formula Student driving sim — procedurally-generated cone circuits via complex Fourier synthesis, rescaled until the tightest corner clears a minimum radius; a dynamic bicycle model (Pacejka tyre, kinematic blend through standstill) driven autonomously by a dual-lookahead path-follower with live telemetry.
order: 15
section: motorsport
lineage:
  - { note: "the production line — this Unity prototype's vehicle-dynamics work moved to the C++ velox library", slug: commonroad }
buckets: [control, graphics]
stack: ["C#", Unity 6, "System.Numerics"]
metrics:
  - { label: "Tyre model", value: "Pacejka magic formula", source: "fsai-unity: Assets/SimulationModels/DynamicBicycleModel/DynamicBicycle.cs:114-125, checked 2026-09-11" }
  - { label: "Track generation", value: "complex Fourier synthesis", source: "fsai-unity: Assets/PathLogic/PathGenerator.cs:58-90, radius rescale at :159-171, checked 2026-09-11" }
  - { label: "Low-speed model", value: "kinematic blend ≤3.5 m/s", source: "fsai-unity: DynamicBicycle.cs:74-90, checked 2026-09-11" }
  - { label: "C# engine", value: "~2.6k LOC", source: "fsai-unity: wc -l over 16 hand-written Assets/*.cs (vendored YamlDotNet excluded) = 2,619, re-measured 2026-09-11" }
role: Sole author (Formula Student). Wrote the dynamic bicycle vehicle model (Pacejka tyre, aero down/drag-force, low-speed kinematic correction), the procedural cone-track generator (a complex-Fourier path with curvature-derived corner radii and a minimum-radius rescale), the autonomous lookahead path-following controller, and the real-time telemetry + CSV logging — all C# on Unity 6 (6000.0.22f1).
status: archived
repo: { kind: private }
dates: "2024–25"
---

The interactive, game-engine take on the Formula Student driving problem: a Unity/C# sim where a car
drives itself around **procedurally-generated cone circuits**, with the vehicle physics integrated by
hand rather than handed to Unity's engine. It predates the C++ vehicle-dynamics work (`velox` / the
FSAI stack) elsewhere in this portfolio, and fed into it. This is where the ideas were first
prototyped with a renderer attached.

## Procedurally-generated cone circuits

Tracks aren't hand-drawn — they're synthesised in the complex plane. `PathGenerator`
(`PathGenerator.cs:58-90`) samples the unit circle as `z[t] = e^{iθ}`, then sums harmonics
(frequencies 2…N, each with a random phase) to warp that circle into a closed, wiggly loop. The
clever part is enforcing drivability. It computes each point's corner radius from the path's
curvature, `|P′|³ / Im(conj(P′)·P″)` (`PathGenerator.cs:41-55`), finds the tightest corner on the
loop, and then scales the *entire* path by `minCornerRadius / R_min` (`PathGenerator.cs:159-171`)
so the worst corner lands exactly on the minimum radius a real car could take. One deterministic
rescale, no rejection sampling and no retry loop — the shape is kept, the size is corrected. Cones
are then placed at a half-track-width offset and checkpoints fall out of the cone geometry.

```text
  z(t) = e^(i*theta)        sample the unit circle
          |
          v
  sum harmonics 2..N        random phase per harmonic
          |
          v
  closed wiggly loop
          |
          v
  R = |P'|^3 / Im(conj(P')*P'')     corner radius per point
          |
          v
  R_min = min(R)  ->  scale = R_target / R_min
          |
          v
  scale every point + radius        tightest corner now
  by that one factor                exactly R_target
          |
          v
  cones at +/- half track width
          |
          v
  checkpoints fall out of the cone geometry
```
*Fig. 1 — track synthesis: a Fourier-warped unit circle, measured for its tightest corner, then uniformly rescaled until that corner is drivable.*

## The vehicle: a dynamic bicycle that blends to kinematic at low speed

`DynamicBicycle` (`DynamicBicycle.cs`) integrates a single-track model. Lateral forces come from a
**Pacejka "magic formula" tyre**, `μ_y = D·sin(C·atan(B(1−E)α + E·atan(Bα)))`
(`DynamicBicycle.cs:114-125`), with aerodynamic downforce and drag scaling as `v²`, and yaw
dynamics from the front and rear cornering forces about the axle distances. The honest engineering
touch is the low-speed singularity fix. A pure dynamic bicycle model blows up as `v → 0`, because
slip angles divide by speed. So `_fKinCorrection` (`DynamicBicycle.cs:74-90`) forms a blend weight
`clamp01(0.5·(v − 1.5))` and mixes the dynamic longitudinal velocity, lateral velocity and yaw rate
against a kinematic solution: below 1.5 m/s the state is *entirely* kinematic, the dynamic model
fades in linearly across the next 2 m/s, and above 3.5 m/s the kinematic term is gone. The car
pulls away from standstill cleanly instead of exploding — the same class of fix the production C++
models later needed.

```text
  kinematic weight = 1 - clamp01(0.5*(v - 1.5))
  1.0 |##########
      |          #####
      |               #####
      |                    #####
  0.0 +--------------------------+-------------------
      0           1.5          3.5 m/s      speed -->
      |<- pure   ->|<- blend ->|<- dynamic bicycle --
      |  kinematic |           |  Pacejka tyre + aero v^2
```
*Fig. 2 — the low-speed blend: fully kinematic below 1.5 m/s, fully dynamic above 3.5 m/s, linear in between.*

## Driving it: an autonomous lookahead controller

No human input — a `RacingAlgorithm` (`RacingAlgorithm.cs`) follows the generated line with
**separate speed-dependent lookahead horizons for speed and for steering** — it scans
`floor(0.7·v) + 1` checkpoints ahead for the speed plan and only `floor(0.1·v) + 1` for steering
(`RacingAlgorithm.cs:77,83,159-160`), the same decoupling that turns up again in the dissertation
controller years later. It caches
directions and distances to upcoming checkpoints once per step and plans a target speed from the
upcoming corner angle. Heading error becomes a steering command via a time-to-react model, clamped
to the car's real limits (±21° steer from the FS-AI API, `RacingAlgorithm.cs:289,314-315`, and
bounded throttle/brake). A telemetry overlay shows angle-to-checkpoint, speed, lateral
acceleration, yaw rate and lap time live; a separate test mode in `CarController` streams the same
state to `car_test_log.csv` for offline analysis.

Each physics step runs the same loop:

```text
  RacingAlgorithm (per physics step)
  +--------------------------------------------+
  | checkpoint cache: directions + distances   |
  |   speed lookahead   |   steering lookahead |
  |   floor(0.7v)+1     |   floor(0.1v)+1      |
  |   checkpoints       |   checkpoints        |
  |    |                    |                  |
  |    v                    v                  |
  | corner angle        heading error          |
  |    |                    |                  |
  |    v                    v                  |
  | target speed        time-to-react model    |
  |    |                    |                  |
  |    v                    v                  |
  | throttle / brake    steering               |
  | (bounded)           (clamped +/- 21 deg)   |
  +--------------------------------------------+
          |
          v
  DynamicBicycle integrates one step
          |
          +--> telemetry overlay + optional CSV
          |
          +--> state feeds the next step
```
*Fig. 3 — the per-step control loop, from the dual checkpoint lookahead to clamped steering, integration, and telemetry.*

## Honest scope

This is an **archived prototype**, and it's framed as one. The controller is a heuristic
look-ahead, not an optimal (MPC/LQR) planner. The sim is validated by *running* (lap completion,
sane telemetry), not against real-vehicle data — there are no unit tests, and the project isn't
under version control at all: it survives as a working tree plus a 459 MB packaged zip, so there
is no commit history to point at. It's a single scene with one vehicle model, and of the 238 C#
files in `Assets/` only 16 (~2.6k lines) are mine — the rest is a vendored YamlDotNet. Its real
value is as the Unity-era exploration of vehicle dynamics, procedural tracks, and autonomous
control that the production work then re-implemented in C++ (`velox`, the FSAI simulator): faster
and instrumented, embedded in the real driverless pipeline. Shown here for the breadth (game-engine
+ C# + the procedural-track maths) and the lineage, not as the finished article.
