---
title: AUBRY — Autonomous Cinematography Drone
tagline: A camera drone that follows a subject and frames the shot itself — a "follow & react" trailing controller and a "cinematic framing" controller with potential-field obstacle avoidance and a decoupled virtual gimbal, built on the aero-lab racing stack's inner loop.
order: 13
section: drones
lineage:
  - { note: "reuses the aero-lab racing stack's differential-flatness inner loop, untouched", slug: aero-lab }
buckets: [control]
stack: [Python, NumPy, VisPy]
metrics:
  - { label: "Controllers", value: "2 cinematic", source: "aero-lab: aubry/follow_controller.py (AUBRYFollowController), aubry/framing_controller.py (AUBRYFramingController)" }
  - { label: "Source", value: "470 LOC", source: "aero-lab: wc -l src/aerolab/controllers/aubry/*.py → 470 total" }
  - { label: "Obstacle avoidance", value: "APF + 4-pass detour", source: "aero-lab: aubry/obstacles.py:51 (repulsion()), aubry/trail.py:21 (_DETOUR_PASSES=4), trail.py:81 (detour loop)" }
  - { label: "Inner loop", value: "shared, RRHC untouched", source: "aero-lab: aubry/follow_controller.py:20,110 + framing_controller.py:20,94 → accel_yaw_to_motor_speeds(); follow_controller.py:6 docstring confirms RRHC unmodified" }
role: Sole author. Designed both cinematic controllers on top of the existing quadrotor stack — a trailing controller that keeps a target arc-length gap behind a moving subject via a rolling breadcrumb spline with iterative obstacle-detour resampling, and a framing controller that holds a relative-pose "front selfie" target with artificial-potential-field repulsion and a decoupled virtual gimbal whose look-at is computed in the runner layer independently of the airframe attitude. Both reuse the shared differential-flatness inner loop without touching RRHC.
status: working
repo: { kind: private }
dates: "2026"
---

AUBRY is the camera-drone track inside the aero-lab project: instead of racing a gate course, the
quadrotor's job is to **follow a person and compose a watchable shot** — the problem DJI and Skydio
solve in hardware. It is built **on top of** the racing stack, not beside it: both AUBRY controllers
choose a desired acceleration and yaw, then hand off to the exact same analytic
flatness → attitude-PD → rate-P → mixer chain every racing controller uses. The flight physics are
shared and proven; the new work is *what to point the camera at, and how to get there without hitting
anything.*

## Follow & react — trailing a moving subject

The follow controller keeps the drone a target **arc-length gap** behind the subject along a rolling
**breadcrumb spline**: the subject's recent positions are accumulated, fitted with an open cubic
spline, and the drone tracks a point a fixed distance back along that curve — so it follows the
*path the subject took*, cornering through the same line rather than cutting across. When obstacles
sit on the trailing path, a **4-pass iterative detour** resamples the breadcrumb around each one until
the path is clear, then feeds the cleared waypoint to the shared inner loop as a desired acceleration.

## Cinematic framing — holding the shot

The framing controller targets a **relative pose** in the subject's frame — e.g. a front "selfie"
offset — and drives the drone to hold that geometry as the subject moves. Obstacles push back through
an **artificial-potential-field** repulsion term added to the framing acceleration, so the drone
slides around hazards while keeping the subject roughly framed. The camera is a **decoupled virtual
gimbal**: a look-at orientation computed independently of the airframe attitude (in the runner/render
layer, not the controller), so the shot stays on the subject even while the body pitches to translate.

## Honest scope

AUBRY is the **actively-growing edge** of the repo, and it's deliberately staged: the controllers and
their obstacle handling run in simulation against a **scripted subject** — there is **no real
perception yet** (no detection/tracking of a real target), and the later roadmap stages (richer
framing modes, real subject estimation) are planned, not built. What exists is real and tested: two
working cinematic controllers, potential-field and detour obstacle avoidance, and a virtual-gimbal
viewport — all riding the same flight stack that races gates elsewhere in aero-lab.
