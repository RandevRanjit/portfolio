---
title: FSAI Unity Driving Simulator
tagline: An earlier Unity/C# Formula Student driving sim — procedurally-generated cone circuits via complex Fourier synthesis with curvature-bounded corners, a dynamic bicycle model (Pacejka tyre + low-speed kinematic blend), driven autonomously by a lookahead path-follower with live telemetry.
order: 15
section: motorsport
lineage:
  - { note: "the production line — this Unity prototype's vehicle-dynamics work moved to the C++ velox library", slug: commonroad }
buckets: [control, graphics]
stack: ["C#", Unity 6, "System.Numerics"]
metrics:
  - { label: "Tyre model", value: "Pacejka magic formula", source: "fsai-unity: Assets/SimulationModels/DynamicBicycleModel/DynamicBicycle.cs:114-125" }
  - { label: "Track generation", value: "complex Fourier synthesis", source: "fsai-unity: Assets/PathLogic/PathGenerator.cs:58-90" }
  - { label: "Low-speed model", value: "kinematic blend", source: "fsai-unity: DynamicBicycle.cs:74-90" }
  - { label: "C# engine", value: "~2.6k LOC", source: "fsai-unity: wc -l Assets custom *.cs = 2619" }
role: Sole author (Formula Student). Wrote the dynamic bicycle vehicle model (Pacejka tyre, aero down/drag-force, low-speed kinematic correction), the procedural cone-track generator (a complex-Fourier path with curvature-derived corner radii and a minimum-radius constraint), the autonomous lookahead path-following controller, and the real-time telemetry + CSV logging — all C# on Unity 6.
status: case-study
repo: { kind: private }
dates: "2025"
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
curvature, `|P′|³ / Im(conj(P′)·P″)` (`PathGenerator.cs:41-55`), and rejects or rescales geometry
that violates a minimum-corner-radius constraint, so every generated circuit is something a real
car could actually take. Cones are then placed at a half-track-width offset and checkpoints fall
out of the cone geometry.

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
  R = |P'|^3 / Im(conj(P')*P'')     corner radius
          |
          v
  R < R_min --yes--> reject / rescale and retry
          | no
          v
  cones at +/- half track width
          |
          v
  checkpoints fall out of the cone geometry
```
*Fig. 1 — track synthesis: a Fourier-warped unit circle, curvature-checked against a minimum corner radius, then dressed with cones.*

## The vehicle: a dynamic bicycle that blends to kinematic at low speed

`DynamicBicycle` (`DynamicBicycle.cs`) integrates a single-track model. Lateral forces come from a
**Pacejka "magic formula" tyre**, `μ_y = D·sin(C·atan(B(1−E)α + E·atan(Bα)))`
(`DynamicBicycle.cs:114-125`), with aerodynamic downforce and drag scaling as `v²`, and yaw
dynamics from the front and rear cornering forces about the axle distances. The honest engineering
touch is the low-speed singularity fix. A pure dynamic bicycle model blows up as `v → 0`, because
slip angles divide by speed. So `_fKinCorrection` (`DynamicBicycle.cs:74-90`) blends the dynamic
state toward a kinematic model below ~1.5 m/s, and the car pulls away from standstill cleanly
instead of exploding — the same class of fix the production C++ models later needed.

```text
  kinematic weight via _fKinCorrection
  1.0 |######
      |      ######
      |            ######      slip angles divide by v
      |                  ####  so pure dynamic blows up
  0.0 +----------------------+----------------------
      0                  ~1.5 m/s         speed -->
      |<------ blend ------->|<-- dynamic bicycle --
                                Pacejka tyre + aero v^2
```
*Fig. 2 — the low-speed blend: kinematic weight decays to zero by ~1.5 m/s, where the dynamic bicycle takes over.*

## Driving it: an autonomous lookahead controller

No human input — a `RacingAlgorithm` (`RacingAlgorithm.cs`) follows the generated line with a
speed-dependent look-ahead. It caches directions and distances to upcoming checkpoints and plans a
target speed from the upcoming corner angle. Heading error becomes a steering command via a
time-to-react model, clamped to the car's real limits (±21° steer, bounded throttle/brake). A
telemetry overlay shows angle-to-checkpoint, speed, lateral acceleration, yaw rate and lap time
live, with optional CSV export for offline analysis.

Each physics step runs the same loop:

```text
  RacingAlgorithm (per physics step)
  +--------------------------------------------+
  | checkpoint cache: directions + distances   |
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
*Fig. 3 — the per-step control loop, from checkpoint cache to clamped steering, integration, and telemetry.*

## Honest scope

This is an **archived prototype**, and it's framed as one. The controller is a heuristic
look-ahead, not an optimal (MPC/LQR) planner. The sim is validated by *running* (lap completion,
sane telemetry), not against real-vehicle data. And it's a single scene with one vehicle model. Its
real value is as the Unity-era exploration of vehicle dynamics, procedural tracks, and autonomous
control that the production work then re-implemented in C++ (`velox`, the FSAI simulator): faster
and instrumented, embedded in the real driverless pipeline. Shown here for the breadth (game-engine
+ C# + the procedural-track maths) and the lineage, not as the finished article.
