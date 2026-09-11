---
title: Proce-Tree — Procedural Tree Generator
tagline: A real-time procedural tree grown from a resource-flow model — branches that steer away from their own crowded canopy, cross-sectional area conserved at every fork, depth-decaying splits, and camera-facing instanced leaves, in Three.js.
order: 14
section: other
buckets: [graphics]
stack: [JavaScript, "Three.js", Vite]
metrics:
  - { label: "Growth model", value: "resource-flow + area", source: "proce-tree: src/tree.js:52-89 (grow), :77-79 (area-conserving pass ratio) — re-read 2026-09-11" }
  - { label: "Branch steering", value: "canopy-density avoidance", source: "proce-tree: src/tree.js:140-179 (leafdensity), :116 (call site) — re-read 2026-09-11" }
  - { label: "Leaves", value: "instanced billboards", source: "proce-tree: src/main.js:163-187 (InstancedMesh) + src/tree.js:251-266 (billboard matrices) — 2026-09-11" }
  - { label: "Engine", value: "~520 LOC", source: "proce-tree: wc -l src/*.js = 519 (main 196, tree 277, tester 46) — re-measured 2026-09-11" }
role: Sole author. Designed the growth algorithm — a binary-splitting branch model fed by a "growth resource" that is consumed in proportion to cross-sectional area and conserved across each fork, with branches that compute a weighted-average canopy position and grow *away* from it — plus the Three.js scene, the per-frame branch geometry, and the camera-facing instanced leaf billboards.
status: working
repo: { kind: public, url: "https://github.com/RandevRanjit/Proce-Tree" }
dates: "2026"
---

A procedural tree that **grows** rather than being drawn. Each frame the root is fed a "growth
resource" (0.075 per tick). The resource flows up the tree, thickening branches and pushing tips
outward until they split, with two botanical constraints baked into the rules: **mass is
conserved**, and branches avoid crowding their own canopy. The README calls it "L-system-inspired",
but there is no string rewriting anywhere in it. It's a small resource-flow simulation over a binary
branch tree.

## The growth model: a resource that flows and conserves area

A branch is a node with a length, a cross-sectional `area`, and two children. Calling `grow(feed)`
(`tree.js:52`) does two things. A tip extends by `∛feed` and converts the rest of its feed into
extra area. An already-split branch decides how much feed to keep vs pass on to its children. That
split is where the physics lives: with area conservation on, the pass ratio is
`(A.area + B.area) / (A.area + B.area + this.area)` (`tree.js:77-79`), so the parent only thickens
in proportion to the area it already carries relative to its children. The result is a trunk that
genuinely tapers into its limbs instead of every branch ballooning equally. Radius is recovered from
area the honest way, `r = √(area/π)`.

```text
              feed f (this frame)
                      |
                      v
        +------------------------------+
        | parent branch  (area = self) |
        +------------------------------+
           |                       |
           | keep:                 | pass:
           | f * self/(A+B+self)   | f * (A+B)/(A+B+self)
           v                       |
    thickens parent         +------+------+
                            |             |
                            v             v
                      +----------+  +----------+
                      | child A  |  | child B  |
                      | area = A |  | area = B |
                      +----------+  +----------+
```
*Fig. 1 — feed flow at a fork: the pass ratio conserves cross-sectional area, which is what makes the trunk taper into its limbs.*

A tip splits once it passes a length threshold that decays with depth, `splitsize · e^(−decay·depth)`
(`tree.js:65-68`, `splitsize = 2.2`, `decay = 0.1`), so the crown forks readily while the trunk
stays long. The way a real tree does. Growth stops recursing once the feed reaching a subtree drops
below `1e-5`, which is what keeps the per-frame traversal bounded.

## Branches that avoid their own canopy

When a branch splits, the two children don't just inherit a fixed angle. `leafdensity()`
(`tree.js:140-179`) walks the subtree to compute a weighted-average position of the surrounding
leaves, then returns a direction that points *away* from that centroid, blended with a little noise
(`globalDirectedness = 0.7` weights the two). The new branch directions are built perpendicular to
the parent and lerped back toward it by the feed ratio. Growth fills empty space and self-shadowing
drops — a cheap trick, but a convincing one, and it's what makes the canopy read as organic.

```text
   top-down view at a fork

         *   *
      *    c    *        leaves of the subtree;
         *   *           c = weighted-average
              .              position (leafdensity)
               .
                .  d = direction from fork to c
                 .
                  o  fork point
                   \
                    \  children steer along -d
                     \ (away from c) blended
                      v with noise; then lerped
                        back toward the parent
                        by the feed ratio
```
*Fig. 2 — canopy avoidance: new children steer away from the weighted leaf centroid, into the empty side of the canopy.*

## Rendering: instanced billboard leaves

Leaves only spawn past a minimum depth (`globalLeafMinDepth = 3`), 30 per terminal branch, scattered
with a seeded hash (`hashRand(ID + i)`, `tree.js:215-217`) so each branch's foliage is consistent
frame-to-frame rather than flickering. `constructBillboardLeafMatrices` (`tree.js:251-266`) then
recomposes every leaf matrix from its position, the *camera's* quaternion and a uniform 0.2 scale,
so each leaf turns to face the viewer. They all render through a single `InstancedMesh`
(`main.js:169-187`): thousands of leaves in one draw call.

```text
   every frame
   -----------
     feed the root
          |
          v
     grow() recurses ........ tips extend by feed^(1/3);
          |                   forks split feed by area
          v
     rebuild branch geometry  dispose + rebuild every
          |                   tapered cylinder; no
          v                   incremental update
     rebuild leaf matrices .. hashRand(ID+i) keeps the
          |                   foliage stable; each one
          v                   takes the camera's rotation
     one InstancedMesh draw   thousands of leaves in
                              a single draw call
```
*Fig. 3 — the per-frame pipeline: feed in at the root, one instanced draw call out.*

## Honest scope

This is a focused generative-graphics piece, not a production renderer. It uses Three.js's built-in
`MeshBasicMaterial` throughout: no custom GLSL, no lighting. Branches are 8-sided tapered cylinders
(top radius = 0.525 × bottom); the "billboard" leaves are actually unit `BoxGeometry` cubes scaled
to 0.2 and rotated to the camera — cheap and convincing at distance, but boxes, not textured quads.
A leaf PNG is loaded in `main.js` and then never bound to the leaf material, so it is dead code.
It grows a single tree. No wind, no pruning, no terrain placement. And it disposes and rebuilds all
branch geometry from scratch every frame rather than updating incrementally — fine at this scale,
but not tuned for a forest. The interesting part is the *algorithm*: a small, honest model where area
conservation and density-avoidance do the heavy lifting.
