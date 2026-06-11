---
title: FSAI Driverless Racing Simulator
tagline: Architected and authored the simulation engine (~29k of 34k LOC C++) — RK4 adaptive sub-stepping over three CommonRoad models (7/9/29 state), an OpenGL stereo camera (PBO readback), and ns-budget timing across a software CAN bus. On an 11-person Formula Student AI team I wrote the physics, IO, CAN, and infra; perception by teammates.
order: 9
section: motorsport
lineage:
  - { note: "the physics core is the velox vehicle-dynamics library (CommonRoad C++ Port)", slug: commonroad }
buckets: [systems, control]
stack: ["C++17", CMake, Eigen, OpenGL, SDL2, ONNXRuntime, OpenCV, SocketCAN]
metrics:
  - { label: "Codebase", value: "~29k LOC (of 34k)", source: "git ls-files excl third_party + git blame, 2026-05" }
  - { label: "Vehicle dynamics", value: "RK4, 3 models (7–29 state)", source: "fsai-sim: velox/lib/simulation/vehicle_simulator.cpp:43-90, model_timing.cpp:21-60" }
  - { label: "Stereo camera", value: "PBO readback + ring buffer", source: "fsai-sim: io/camera/sim_stereo/readback_pbo.cpp:46-75" }
  - { label: "Real-time budgets", value: "ns clock, 4 subsystems", source: "fsai-sim: common/include/common/time/budget.h, fsai_run.cpp:1909-1915" }
role: Architect and sole author of the simulation engine (~29k of 34k LOC). Designed and wrote the velox physics core (RK4 + adaptive sub-stepping, all three CommonRoad vehicle models), the sim loop, the OpenGL FBO stereo camera with PBO readback, the AI-to-VCU CAN interface and UDP S-VCU link, the ns-budget timing + swappable-clock infrastructure, and all common/IO/control libraries. 11-person team project; the ONNX/SIFT/Kalman perception pipeline was teammates' work — it plugs into the camera and pose feeds I built.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/FSAI-Simulation-C" }
dates: "2025"
---

A driverless-racing simulator in C++ for a Formula Student AI team: the rig you test an
autonomous-vehicle stack against before it touches a real car.
I architected and authored the entire simulation engine — the velox physics library (vehicle
dynamics, RK4 integrator, all three runtime-switchable CommonRoad models), the sim loop, the
IO layer (stereo camera, CAN and UDP transport), the common timing and clock infrastructure,
and the software-CAN stack. Roughly **29k of the 34k lines**.
This is an 11-person team project; the ONNX/SIFT/Kalman perception pipeline was a teammate's
contribution, plugging into the camera and vehicle-pose feeds I built.

## Vehicle dynamics: RK4 over three real models

The integrator is a hand-written 4th-order Runge-Kutta step
(`VehicleSimulator::step`), not Euler and not a black-box library call: it evaluates the
dynamics at the four RK4 stages, validates that each stage returns a state vector of the right
dimension, and applies the weighted update.
It drives three runtime-switchable models, each a distinct CommonRoad-style formulation with a
different state dimension:

- **ST** — single-track (bicycle), 7-state.
- **STD** — single-track with drift dynamics, 9-state.
- **MB** — full multi-body with suspension and load transfer, 29-state.

Which one runs is a YAML field (`configs/vehicle/ads-dv.yaml: model: std`). No recompile.
The simulator carries them behind one `ModelInterface` (init / dynamics / speed function
pointers), so the same RK4 loop, the same safety latch, and the same timing code work
unchanged whether you are integrating 7 states or 29.

**Why sub-stepping.** A real-time loop hands you a variable frame time. Integrate a stiff 29-state
model across a 50ms hitch in one RK4 step and it goes unstable.
`ModelTiming::plan_steps` splits the requested `dt` into
`ceil(dt / max_dt)` equal sub-steps, then refuses to go below a 1ms stability floor
(`kMinStableDt`), clamping rather than producing a sub-step too small to be meaningful.
The RK4 step then runs once per sub-step.

```text
a frame hitch hands the integrator dt = 50ms

naive: one RK4 step across the whole hitch
  [................... 50ms ...................]
  stiff 29-state MB model -> unstable

plan_steps: n = ceil(dt / max_dt), floored at 1ms
  [....][....][....][....][....][....][....][....]
  one RK4 step per sub-step, never below kMinStableDt
```

*Fig. 1 — plan_steps splits a frame hitch into equal RK4 sub-steps with a 1ms floor.*

That is the correct, boring answer to frame-time jitter, and it is why the sim stays stable
when the render thread stalls.

A safety layer rides on top of the integrator: a low-speed-safety latch that zeroes
longitudinal drift through standstill (so the car doesn't creep from numerical noise) and a
loss-of-control detector, both config-driven per model.

## Synthetic stereo camera, not ground truth

Rather than handing the perception stack the cone positions, the sim *renders* what a stereo
camera would see and makes perception earn them.
I built the camera in `io/camera/sim_stereo`: an OpenGL framebuffer renders the cone field for
the left and right eyes, then a pixel-buffer-object readback (`glReadPixels` into a
`GL_PIXEL_PACK_BUFFER`, then `glMapBufferRange`) pulls the frames back off the GPU.
Frames land in a ring buffer that a dedicated vision thread drains non-blocking, so GPU→CPU
transfer and frame production are decoupled from the consumer. A slow detection frame never
stalls the render loop.

```text
render thread (mine)            vision thread (teammate)
+-------------------+           +----------------------+
| OpenGL FBO        |           | ONNX YOLO + NMS      |
| left / right eyes |           | SIFT stereo match    |
+---------+---------+           | Kalman + landmark map|
          |                     +-----------^----------+
   glReadPixels into                        |
   GL_PIXEL_PACK_BUFFER                     |  non-blocking
   glMapBufferRange                         |  drain
          v                                 |
+-------------------+                       |
|    ring buffer    +-----------------------+
+-------------------+
```

*Fig. 2 — frame path: FBO render, PBO readback, ring buffer, vision thread.*

The perception pipeline that consumes those frames (a teammate's work) is a real one: ONNX
YOLO cone detector with NMS and a per-track ID assigner, per-cone SIFT stereo matching under an
epipolar constraint, triangulation, a constant-velocity Kalman filter, and a recursive-Bayesian
landmark map. Which is exactly the point. The camera I wrote has to be good enough that a
genuine detector locks onto it.

## A software CAN bus to a separate VCU process

The control side talks to the vehicle-control unit the way the real car does — over CAN.
I wrote the AI-to-VCU adapter (`control/runtime_cpp`) that packs planner outputs into
`can_frame` structures (SocketCAN ABI) and unpacks VCU feedback, plus a UDP link
(`sim/svcu`) that carries those packed frames between the simulator and a separate S-VCU stub
process.
So the integration test isn't a function call across a module boundary. It's two processes
exchanging CAN frames over a socket, with acknowledgement-timeout tracking and staleness
colouring in the GUI. That is the shape of the real bring-up problem.

```text
 simulator process              S-VCU stub process
+---------------------+        +-----------------+
| AI-to-VCU adapter   |        |                 |
| control/runtime_cpp |        | receives frames |
| packs planner cmds  |        | replies with    |
| into can_frame      |        | VCU feedback    |
| (SocketCAN ABI)     |        |                 |
+----------+----------+        +--------+--------+
           |    UDP link (sim/svcu)     |
           |----- CAN frames ---------->|
           |<---- feedback frames ------|

   ack-timeout tracking + staleness colouring in the GUI
```

*Fig. 3 — two processes exchanging packed CAN frames over the UDP S-VCU link.*

## Real-time budget timing with a swappable clock

Every subsystem runs against an explicit nanosecond budget.
The timing infra (`common/time/budget.*`) is a C-ABI core with an RAII `ScopedBudgetTimer`
(and typed `VisionStageTimer` / `ControlStageTimer` / etc.) designed to record last / worst / mean
duration per subsystem and report against a configured budget.
`fsai_run` configures four budgets at startup (Simulation Renderer, Planner + Controller,
Vision Pipeline, CAN Dispatch) and stage timers wrap the hot paths. But
`fsai_budget_stage_record` and `fsai_budget_report_all` are currently stubs: the scaffold is
wired up, the data is not yet recorded or surfaced.
Behind it sits a clock (`fsai_clock`) that runs in realtime or simulated mode. In simulated
mode time is advanced explicitly, which is what makes deterministic replay possible.
(The timers *measure and report* against budget; they don't pre-empt a stage that overruns.
They tell you which one did.)

## Honest scope

- The budget timers are scaffolded (configured, wired into hot paths) but do not yet profile or
  warn: `fsai_budget_stage_record` is an unimplemented stub and `fsai_budget_report_all` is
  declared in the header but has no implementation, so no overrun data is recorded or reported.
- The PBO readback is single-buffered: it maps immediately after `glReadPixels` rather than
  ping-ponging across frames, so it doesn't hide readback latency the way a double-PBO scheme
  would. The decoupling that matters comes from the ring buffer + vision thread, not the PBO.
- Testing is integration/bring-up harnesses, not a unit suite: the S-VCU loopback harness is
  substantial (~800 lines, Linux-gated, real threads and sockets), but the track-generation
  test has no assertions. Coverage is thin and uneven.
- It is a team project. I led and wrote the engine; the perception stack and parts of the
  path/centerline planner are teammates' work. I've drawn that line explicitly above rather
  than claim the whole codebase.
