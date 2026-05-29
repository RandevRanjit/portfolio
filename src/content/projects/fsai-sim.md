---
title: FSAI Driverless Racing Simulator
tagline: 34k LOC C++ fixed-timestep sim — RK4 with adaptive sub-stepping, closed perception loop (ONNX + SIFT + Kalman), nanosecond budget timers.
order: 9
buckets: [systems, control]
spokes:
  - { id: motorsport, role: flagship, blurb: "Fixed-timestep driverless racing simulator: RK4 vehicle dynamics, three runtime-switchable models, and a closed ONNX+SIFT+Kalman perception loop." }
  - { id: drone, role: secondary, blurb: "C++ real-time systems: RK4 adaptive sub-stepping, async PBO readback, ns budget timers, SocketCAN/UDP — the embedded systems toolkit." }
stack: ["C++17", CMake, ONNXRuntime, OpenCV, Eigen]
metrics:
  - { label: "Codebase", value: "34,148 LOC C++", source: "audit §fsai-simulation-c (git ls-files excl third_party)" }
  - { label: "Dynamics", value: "RK4 + adaptive sub-stepping", source: "audit §fsai-simulation-c (vehicle_simulator.cpp:56-74)" }
  - { label: "Perception loop", value: "ONNX + SIFT + Kalman map fusion", source: "audit §fsai-simulation-c (vision/runtime_cpp)" }
role: Sole author. Built the RK4 vehicle dynamics with adaptive sub-stepping, the three runtime-switchable vehicle models (MB/ST/STD), the closed perception pipeline (stereo FBO → async PBO readback → SIFT disparity → ONNX cone detector → Kalman tracker → BayesianMapper), and the ns budget timer infra.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/FSAI_Simulation_C" }
dates: "2025"
---

A fixed-timestep driverless racing simulator written in C++: RK4 vehicle dynamics, a closed
perception loop, and nanosecond-resolution budget timers — the kind of architecture you'd use
in a real autonomous-vehicle stack, not a game engine.

**Vehicle dynamics.** `SimulationDaemon::step()` calls `ModelTiming::plan_steps()` to split the
caller's `dt` into numerically stable sub-steps; `VehicleSimulator::step()` runs a 4th-order
Runge-Kutta integrator over three runtime-switchable models (MB multi-body / ST single-track /
STD kinematic), YAML-selectable without recompile. Adaptive sub-stepping is the correct handling
of a variable-frame-time real-time loop.

**Closed perception loop.** Rather than injecting ground-truth cone positions, the sim runs a real
detection pipeline: stereo frames rendered to an OpenGL FBO → **async PBO readback** (decouples GPU→CPU
transfer from the render thread — the embedded-vision pattern for avoiding a stall) → OpenCV SIFT
disparity → ONNX `ConeDetector` (`cone_model.onnx`) → `ConeTracker` (NN/IoU matching, lost-frame
eviction) → `BayesianMapper`/`KalmanFilter` map fusion.

**IO / telemetry.** Two CSV log streams (`std::fprintf`), SocketCAN pack/unpack glue, and a UDP/CAN
S-VCU control-ingress shim. Nanosecond-resolution budget timers gate each pipeline stage.

_Honest caveats (audited):_ tests are two printfs with no assertions; the SDL loop is not wall-clock-bounded
(no `SDL_Delay`), so it is not deterministic real-time; `VisionNode` uses a coarse `lock_guard` on a
shared render/processing mutex (jitter risk under load). None disqualifying; all documented.
