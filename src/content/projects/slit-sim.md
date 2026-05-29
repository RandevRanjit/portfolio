---
title: Slit Light Interference Simulator
tagline: Physically-correct single-slit Fraunhofer diffraction computed per-fragment on the GPU — sinc² intensity in a custom GLSL shader with live parameters.
order: 11
buckets: [graphics]
spokes:
  - { id: drone, role: secondary, blurb: "GPU-computed physics: sinc² Fraunhofer diffraction, 6 custom GLSL shaders, live wavelength/slit/distance params." }
stack: [JavaScript, "Three.js", GLSL]
metrics:
  - { label: "Custom shaders", value: "6 GLSL shaders", source: "audit §websites (slit-light-interference-sim)" }
  - { label: "Diffraction model", value: "physically-correct sinc² per-fragment", source: "audit §websites (interference_fragment.fs.glsl)" }
role: Sole author. Implemented the interference fragment shader (sinc² intensity formula, correct physical parametrisation), the live control UI, and the Three.js render loop.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/Slit-Light-Interference-Sim" }
dates: "2025"
---

A single-slit Fraunhofer diffraction simulator — the physics computed correctly, per-fragment,
on the GPU, not approximated on the CPU and textures.

The interference fragment shader (`src/shaders/interference_fragment.fs.glsl`) implements:

```
I = I₀ · (sin(p/2) / (p/2))²
p = (slit_width · (uv.x − 0.5)) / (board_slit_distance · wavelength) · 2π
```

This is the exact sinc² Fraunhofer intensity formula, re-derived per fragment at display resolution.
Live controls let you sweep wavelength (colour), slit width, slit-to-screen distance, and intensity
and watch the diffraction pattern update in real time — which is how you build intuition for the
physics, not by staring at a static diagram.

Six custom GLSL shaders total. Stats.js overlay for frame-time monitoring.

The most technically credible entry in the websites collection — the shader implements real physics,
not a visual approximation.
