---
title: Slit Light Interference Simulator
tagline: A 3D single-slit Fraunhofer diffraction lab — the sinc² intensity envelope solved per-fragment on the GPU, wrapped in a Three.js scene with draggable apparatus, live wavelength/slit/distance controls and a real-time measurement readout.
order: 11
buckets: [graphics]
spokes:
  - { id: drone, role: secondary, blurb: "GPU diffraction physics: sinc² Fraunhofer envelope in GLSL, wavelength→CIE-RGB mapping, 3 shader programs, draggable 3D optics bench." }
stack: [JavaScript, "Three.js", GLSL, Tweakpane, Webpack]
metrics:
  - { label: "Diffraction model", value: "sinc² Fraunhofer envelope, per-fragment", source: "slit-sim: src/shaders/interference_fragment.fs.glsl:13-14" }
  - { label: "Shader programs", value: "3 (grid / interference / loading), 6 GLSL files", source: "slit-sim: src/shaders/*.glsl" }
  - { label: "Engine", value: "~1.65k LOC single-file Three.js app", source: "slit-sim: src/script.js (wc -l = 1654)" }
  - { label: "Wavelength→colour", value: "380–780 nm CIE piecewise → RGB", source: "slit-sim: src/script.js:204-274 (nm_to_rgb)" }
role: Sole author. Wrote the interference vertex/fragment shader pair (sinc² envelope, SI-unit parametrisation), the wavelength→RGB conversion, the full Three.js scene graph, the draggable transform-controlled apparatus, the live measurement panel, and the particle-haze system with its sorted exponential-search culling.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/Slit-Light-Interference-Sim" }
dates: "2021, packaged 2026"
---

An interactive optics bench for single-slit diffraction. A 3D laser, slit and screen sit on a grid;
you sweep the wavelength, slit width and slit-to-screen distance with sliders and watch the
diffraction pattern on the screen recompute in real time, while a side panel reads back the live
path-length difference, inspection angle and slit-board distance. The pattern itself is not a texture
or a CPU plot — it is the Fraunhofer intensity solved analytically for every fragment on the GPU.

## The physics, on the GPU

The interference fragment shader (`src/shaders/interference_fragment.fs.glsl`) evaluates the
single-slit Fraunhofer **intensity envelope** per pixel:

```glsl
float p = ((v_slit_width*((v_uv.x)-(0.5)))/(v_board_slit_distance*v_wavelength))*2.0*3.14;
float i = (v_light_intensity*((sin(p/2.0))/(p/2.0)))*(v_light_intensity*((sin(p/2.0))/(p/2.0)))/100.0;
```

That is `I = I₀·(sin β / β)²` with `β = π·a·x′ / (D·λ)` — the textbook sinc² envelope, where the
screen coordinate `x′ = uv.x − 0.5` stands in for `sin θ ≈ x′/D` under the small-angle Fraunhofer
approximation. Crucially the uniforms are fed in **SI units**, not pixels: JavaScript converts the
slider values to metres (`slit_width × 10⁻⁶`, `wavelength × 10⁻⁹`) before they reach the shader
(`src/script.js:1166-1167`), and the slit-to-screen distance `D` is the *actual Euclidean distance*
between the slit and board meshes in the scene — so dragging the screen physically widens or tightens
the fringes for the right reason. The same expression is mirrored on the CPU
(`interference_intensity_graph_animation`, `src/script.js:1620-1621`) to drive the live intensity graph,
keeping the readout and the rendered pattern derived from one formula.

This is the **diffraction envelope of a single slit**, not the double-slit cos² fringe pattern — the
project models exactly what its name claims and no more.

**Honest limits.** `π` is hard-coded as `2.0 * 3.14`, a ~0.05% truncation that shifts fringe minima
very slightly; intensity is scaled (`× I₀` twice, `/100`) rather than normalised to a physical `I₀`,
so the absolute brightness is presentational. The model is the small-angle Fraunhofer regime — fine
for the laser/slit geometry on screen, not a wide-angle or near-field solver.

## Beyond the shader

Most of the engineering is in the ~1650-line Three.js engine, not the 18-line shader:

- **Wavelength → colour done properly.** A piecewise CIE approximation (Fourmilab `specrend`) maps
  any wavelength in 380–780 nm to an RGB triple with gamma and a vision-limit intensity falloff
  (`nm_to_rgb`, `src/script.js:204-274`), so the laser, the haze and the fringe colour all track the
  physical wavelength rather than a hand-picked swatch.
- **A draggable optics bench.** The slit-board distance and the inspection point are both
  `TransformControls` gizmos with clamped translation bounds; dragging either disables the orbit
  camera and the *other* gizmo, and live-recomputes every dependent object — the dashed central axis,
  the angled light ray, the path-length-difference label (rendered as extruded 3D text plus a
  hand-built λ glyph), the angle readout and the diffraction plane.
- **A culled particle haze with a real algorithm.** The volumetric laser haze is 10,000 additive
  points generated once, **merge-sorted by x**, then sliced to the current beam length using a custom
  2D exponential search over the sorted array (`two_d_exponential_search`, `src/script.js:329-371`) —
  an unusual but deliberate choice to avoid re-generating or re-sorting points every time the screen
  moves.
- **Preset import/export.** The full Tweakpane parameter set serialises to a downloadable JSON file
  and reloads back in, so a particular diffraction configuration can be saved and shared.
- **A bespoke loading screen.** A Perlin-noise GLSL shader (Stefan Gustavson's `cnoise`) animates a
  pulsing ring while GLTF models, fonts and assets load through a Three.js `LoadingManager`, then GSAP
  fades the overlay out.

## Architecture & build

Three shader programs total (six GLSL files): the grid floor, the interference plane, and the
animated loading overlay. Bundled with Webpack 5 — a `raw-loader` rule pulls the `.glsl` files in as
strings, `copy-webpack-plugin` ships the static GLTF/font assets, and the scene renders through an
orthographic camera with Reinhard tone mapping. Stats.js panels overlay live FPS and frame-time.

This is early-coursework code, and it shows its age honestly: one 1650-line file with no module split,
a `stats.js` import wired to a hard-coded absolute path from the original machine, and the dead
`dat.gui`/`guify` dependencies left in `package.json` alongside the Tweakpane that actually drives the
UI. What it gets right is the part that matters for a physics simulator — the diffraction maths is the
real Fraunhofer envelope in SI units, derived once and rendered per-fragment, not a lookup table or a
faked gradient.
