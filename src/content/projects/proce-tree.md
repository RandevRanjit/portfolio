---
title: Proce-Tree — Procedural Tree Generator
tagline: A real-time procedural tree grown from a resource-flow model — branches that steer away from their own crowded canopy, cross-sectional area conserved at every fork, depth-decaying splits, and camera-facing instanced leaves, in Three.js.
order: 14
section: other
buckets: [graphics]
stack: [JavaScript, "Three.js", Vite]
metrics:
  - { label: "Growth model", value: "resource-flow + area", source: "proce-tree: src/tree.js:52-90 (grow / pass ratio)" }
  - { label: "Branch steering", value: "canopy-density avoidance", source: "proce-tree: src/tree.js:140-179 (leafdensity)" }
  - { label: "Leaves", value: "instanced billboards", source: "proce-tree: src/main.js:169-188 (InstancedMesh)" }
  - { label: "Engine", value: "~520 LOC", source: "proce-tree: wc -l src/*.js = 519" }
role: Sole author. Designed the growth algorithm — a binary-splitting branch model fed by a "growth resource" that is consumed in proportion to cross-sectional area and conserved across each fork, with branches that compute a weighted-average canopy position and grow *away* from it — plus the Three.js scene, the per-frame branch geometry, and the camera-facing instanced leaf billboards.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/Proce-Tree" }
dates: "2026"
---

A procedural tree that **grows** rather than being drawn. Each frame the root is fed a "growth
resource", and that resource flows up the tree, thickening branches and pushing tips outward until
they split — with two botanical constraints baked into the rules: **mass is conserved** and **branches
avoid crowding their own canopy.** It is not an L-system (no string rewriting) — it's a small
resource-flow simulation over a binary branch tree.

## The growth model: a resource that flows and conserves area

A branch is a node with a length, a cross-sectional `area`, and two children. Calling `grow(feed)`
(`tree.js:52`) does two things: a tip extends by `∛feed` and converts the rest of its feed into extra
area; an already-split branch decides **how much feed to keep vs pass on** to its children. That split
is where the physics lives — with area conservation on, the pass ratio is
`(A.area + B.area) / (A.area + B.area + this.area)` (`tree.js:76-83`), so the parent only thickens in
proportion to the area it already carries relative to its children. The result is a trunk that genuinely
tapers into its limbs instead of every branch ballooning equally. A tip splits once it passes a length
threshold that **decays with depth** — `splitsize · e^(−decay·depth)` (`tree.js:65-68`) — so the crown
forks readily while the trunk stays long, the way a real tree does.

## Branches that avoid their own canopy

When a branch splits, the two children don't just inherit a fixed angle. `leafdensity()`
(`tree.js:140-179`) walks the subtree to compute a **weighted-average position of the surrounding
leaves**, then returns a direction that points *away* from that centroid, blended with a little noise
(`globalDirectedness` weights the two). The new branch directions are built perpendicular to the parent
and lerped back toward it by the feed ratio — so growth fills empty space and self-shadowing is reduced,
which is the cheap-but-convincing trick behind the organic-looking canopy.

## Rendering: instanced billboard leaves

Leaves only spawn past a minimum depth, scattered with a **seeded** hash (`hashRand(ID+i)`,
`tree.js:213-229`) so each branch's foliage is consistent frame-to-frame rather than flickering. They're
drawn as a single `InstancedMesh` whose per-leaf matrices are rebuilt each frame to **face the camera**
(`main.js:169-188`) — thousands of billboards in one draw call.

## Honest scope

This is a focused generative-graphics piece, not a production renderer. It uses Three.js's built-in
materials (no custom GLSL — branches are plain geometry, leaves are flat camera-facing quads), it grows a
**single** tree with no wind, pruning, or terrain placement, and it rebuilds the branch geometry from
scratch every frame rather than updating incrementally — fine at this scale, but not tuned for a forest.
The interesting part is the *algorithm*: a small, honest model where area conservation and density-avoidance
do the heavy lifting.
