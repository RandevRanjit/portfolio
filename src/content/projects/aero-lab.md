---
title: Aero-Lab — Quadrotor Flight Simulator
tagline: From-scratch RK4 rigid-body dynamics with a cascaded PID + differential-flatness controller.
order: 3
buckets: [control]
spokes:
  - { id: drone, role: flagship, blurb: "A full quadrotor flight stack — physics and controller hand-rolled, 322 tests." }
  - { id: motorsport, role: secondary, blurb: "Differential-flatness control and a Gymnasium racing env — transferable control engineering." }
stack: [Python, NumPy, Gymnasium, SciPy]
metrics:
  - { label: "Code", value: "~15.9k LOC", source: "audit §aero-lab" }
  - { label: "Tests", value: "322 functions", source: "audit §aero-lab (def test_ count)" }
  - { label: "Controller", value: "PID + diff-flatness", source: "audit §aero-lab (pid_dfbc/controller.py)" }
role: Sole author. Hand-rolled the 6-DOF physics (RK4, motor lag, gyroscopic torque, aero drag), the cascaded PID + differential-flatness feedforward controller, and the mixer pseudo-inverse.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/Aero-Lab" }
dates: "2026"
---

A quadrotor flight simulator built from first principles: 6-DOF rigid-body dynamics integrated with
RK4, first-order motor lag, gyroscopic precession and aero drag — no physics library. The controller is
a cascaded PID with **differential-flatness feedforward** (Mellinger & Kumar): position PD → flatness
map → attitude PD → rate P → mixer inversion → motor speeds, with velocity feedforward for gate racing.

The mixer pseudo-inverse maps [thrust, roll, pitch, yaw-torque] → per-motor RPM — the same approach as
PX4/Betaflight firmware. 322 tests cover the plant, controllers, envs and metrics.
