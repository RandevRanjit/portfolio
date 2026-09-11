---
title: AUBRY — Autonomous Cinematography Drone
tagline: A camera drone that trails you, leads you and frames the shot itself, answers with a nod or a shake, and decides between those behaviours on its own — four controllers with potential-field obstacle avoidance and a decoupled virtual gimbal, all riding the aero-lab racing stack's inner loop untouched.
order: 13
section: drones
lineage:
  - { note: "reuses the aero-lab racing stack's differential-flatness inner loop, untouched", slug: aero-lab }
buckets: [control]
stack: [Python, NumPy, SciPy, VisPy]
metrics:
  - { label: "Controllers", value: "4 cinematic", source: "aero-lab: src/aerolab/controllers/factory.py:65-68 — aubry_follow, aubry_frame, aubry_gesture, aubry_companion (2026-09-11)" }
  - { label: "Source", value: "981 LOC", source: "aero-lab: wc -l src/aerolab/controllers/aubry/*.py → 981 total across 7 modules (2026-09-11)" }
  - { label: "Tests", value: "56 AUBRY tests", source: "aero-lab: grep -rc 'def test_' tests/controllers/aubry → 56 across 9 files, incl. the T-AUBRY-1…4 smokes (2026-09-11)" }
  - { label: "Obstacle avoidance", value: "APF + 4-pass detour", source: "aero-lab: aubry/obstacles.py:51 (repulsion()), aubry/trail.py:21 (_DETOUR_PASSES=4), trail.py:81 (detour loop) — verified 2026-09-11" }
  - { label: "Inner loop", value: "shared, RRHC untouched", source: "aero-lab: aubry/follow_controller.py:20,110 + framing_controller.py:20,94 → accel_yaw_to_motor_speeds(); follow_controller.py:6 docstring confirms RRHC unmodified (2026-09-11)" }
role: Sole author. Designed four cinematic controllers on top of the existing quadrotor stack — a trailing controller that keeps a target arc-length gap behind a moving subject via a rolling breadcrumb spline with iterative obstacle-detour resampling; a framing controller that leads the subject in a relative-pose "front selfie" with artificial-potential-field repulsion and a decoupled virtual gimbal computed in the runner layer; a gesture controller that perturbs a hover reference into nod/shake/bob/pirouette primitives; and a companion arbiter that picks between come, watch, follow and hover from scripted stimuli, gluing a gesture onto each transition. All four reuse the shared differential-flatness inner loop without touching RRHC.
status: working
repo: { kind: private }
dates: "2026"
---

AUBRY is the camera-drone track inside the aero-lab project: instead of racing a gate course, the
quadrotor's job is to **follow a person, compose a watchable shot, and behave like something you'd
want around**, the problem DJI and Skydio solve in hardware. It is built on top of the racing stack,
not beside it. All four AUBRY controllers choose a desired acceleration and yaw, then hand off to the
exact same analytic flatness → attitude-PD → rate-P → mixer chain every racing controller uses. The
flight physics are shared and proven. The new work is *what to point the camera at, how to get there
without hitting anything, and when to do which of those.*

It has shipped in four stages, each a registered controller and a `--mode` on one runner
(`scripts/fly_aubry.py --mode follow|frame|gesture|companion`):

```text
+-------------+ +-------------+ +-------------+ +-------------+
|   follow    | |   framing   | |  gestures   | |  companion  |
| breadcrumb  | | relative    | | nod/shake/  | | arbiter:    |
| spline +    | | pose + APF  | | bob/        | | come>watch> |
| 4-pass      | | repulsion   | | pirouette   | | follow>     |
| detour      | |             | |             | | hover       |
+------+------+ +------+------+ +------+------+ +------+------+
       |               |               |               |
       +---------------+-------+-------+---------------+
                               |
                               v
                  desired acceleration + yaw
                               |
                               v
               +-------------------------------+
               | shared inner loop, untouched: |
               | flatness -> attitude-PD ->    |
               | rate-P -> mixer               |
               +---------------+---------------+
                               |
                               v
                         motor speeds
```
*Fig. 1 — all four AUBRY controllers hand a desired acceleration and yaw to the same inner loop the racing controllers use.*

## Follow & react — trailing a moving subject

The follow controller keeps the drone a target arc-length gap behind the subject along a rolling
**breadcrumb spline**. The subject's recent positions are accumulated, fitted with an open cubic
spline, and the drone tracks a point a fixed distance back along that curve — so it follows the
*path the subject took*, cornering through the same line rather than cutting across. When obstacles
sit on the trailing path, a 4-pass iterative detour resamples the breadcrumb around each one until
the path is clear, then feeds the cleared waypoint to the shared inner loop as a desired
acceleration. A deadband holds position when the subject stops, so it doesn't creep into them.

```text
  subject's recent positions (breadcrumbs)
    o..o..o..o..o..o..o..o
              |
              v
  fit an open cubic spline; track the point
  a fixed arc-length gap back along the curve
              |
              v
      +--> obstacle on the trailing path?
      |        |                  |
      |       yes                 no
      |        v                  v
      +--- resample the      cleared waypoint
           breadcrumb        feeds the shared
           around it         inner loop as a
           (up to 4 passes)  desired acceleration
```
*Fig. 2 — the trailing pipeline: breadcrumb spline, gap tracking, and the 4-pass detour loop that resamples around obstacles.*

## Cinematic framing — leading, and holding the shot

Where the follow controller trails, the framing controller **leads**. It targets a relative pose in
the subject's own heading frame — the default is a front selfie, a set distance ahead at a set
height, filming the subject head-on — and drives the drone to hold that geometry as the subject
moves. The breadcrumb trail is switched off entirely here: framing chases the subject's *current
pose*, not their path. Obstacles push back through an artificial-potential-field repulsion term
summed into the velocity field, so the drone slides around hazards while keeping the subject roughly
framed.

The camera is a **decoupled virtual gimbal**: a look-at orientation computed independently of the
airframe attitude, in the runner/render layer rather than the controller. The body pitches to
translate; the shot stays on the subject. A second viewport renders AUBRY's POV so the framing can
be judged by eye, which is the actual success bar for this stage.

```text
  controller owns the body      runner owns the camera
  airframe pitches and rolls    virtual gimbal holds a
  to chase the target pose      look-at on the subject

      drone
       [/]  <- body tilted to translate
        \
         ' - - - look-at ray - - - - ->  O   subject
                 stays on the subject   /|\
                 while the body tilts   / \
```
*Fig. 3 — the decoupled virtual gimbal: the body tilts to translate while the look-at, computed in the runner layer, stays on the subject.*

## Gestures, and a brain to choose between them

Two later stages turned AUBRY from a camera rig into something with manners. **Gestures** are four
time-parameterised perturbations of a hover reference — a nod for yes, a head-shake for no, a bob as
a greeting, a 360° pirouette — tracked by the same flatness inner loop, triggered live by keypress
or from a scripted timeline. They are deliberately decoupled from filming: their own controller,
their own mode.

The **companion brain** is the piece that makes it feel autonomous. An arbiter reads a scripted day
— where the subject is, how fast they're moving, whether they've called — and picks one behaviour
per tick from a fixed priority order, with a call-latch, hysteresis around points of interest, and a
minimum dwell so it can't flap between states. Each behaviour reduces to a `(target, yaw)` reference
fed to a single go-to law with obstacle repulsion. On every transition it fires the matching gesture:
bob when it starts following, nod when it comes to you, shake when it gives up and hovers.

```text
  stimuli each tick                arbiter                 output
  ----------------                 -------                 ------
  subject position  -----\    called recently? --> COME
  subject speed     ------>   near a POI?      --> WATCH    (target, yaw)
  call windows      ------>   subject moving?  --> FOLLOW      |
  points of interest ----/    otherwise        --> HOVER       v
                                    |                      one go-to law
                    call-latch + POI hysteresis +          + APF repulsion
                    min-dwell (anti-flap)                        |
                                    |                            v
                       transition --> glue a gesture       shared inner loop
```
*Fig. 4 — the companion arbiter: four prioritised behaviours, anti-flap guards, and a gesture glued onto each transition.*

## Honest scope

AUBRY is the actively-growing edge of the repo, and it is deliberately staged and deliberately
**sim-only** — that was an explicit decision in June 2026, not a gap waiting to be filled. A costed
~£480 hardware BOM exists in the repo, but it is marked forward-planning only; no hardware has been
bought or integrated, and the firmware roadmap is deferred. The big honest caveat is the one that
decision protects: sim hands the controller ground-truth state, while real indoor flight would have
to estimate it from optical flow, which drifts. That is the whole sim-to-real gap.

There is still **no perception**. The subject is a scripted waypoint polyline, the points of interest
are ground-truth scene coordinates, and the call windows are a config file — there is no detection or
tracking of a real target anywhere in the stack. The APF can also sit in a local minimum when an
obstacle is exactly between the drone and its target; that's accepted for the sparse scenarios shipped
and left to a later module. Orbit mode, multi-shot transitions, real gimbal dynamics (the current one
is instantaneous, with no rate or angle limits), video capture, multiple subjects, and the
internal-drives version of the brain are all planned, not built.

What exists is real and tested: four working controllers, potential-field and detour obstacle
avoidance, a virtual-gimbal POV viewport, and 56 tests including a headless smoke per stage — all
riding the same flight stack that races gates elsewhere in aero-lab, which by standing repo invariant
is never modified to make any of this work.
