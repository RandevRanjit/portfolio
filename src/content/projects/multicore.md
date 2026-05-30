---
title: Multicore Computing Labs
tagline: Three parallelism labs on a 72-core 2-socket NUMA machine — a 132× temporal-blocking Jacobi stencil, a 30.7× NUMA-aware vecadd, and dining philosophers scaling near-linearly to 1.04M meals/s.
order: 6
buckets: [systems]
spokes:
  - { id: finance, role: flagship, blurb: "Synchronisation cost, NUMA locality, and lock granularity are the same levers that decide whether an HFT pricing loop scales — here they're measured, not asserted: 256× fewer barriers, first-touch page placement, lock-ordering correctness." }
stack: [C, "C++20", pthreads, OpenMP, "std::barrier", NUMA]
metrics:
  - { label: "Temporal-blocking stencil", value: "132.5× @ 72 cores", source: "multicore: lab3-stencil/CHANGELOG.md:28" }
  - { label: "OpenMP stencil", value: "128.6× @ 72 cores", source: "multicore: lab3-stencil/CHANGELOG.md:30" }
  - { label: "NUMA vecadd speedup", value: "30.7× speedup", source: "multicore: lab1-vecadd/vecadd/results/statistics.csv:80" }
  - { label: "Fine-spinlock philosophers", value: "1,039K meals/s", source: "multicore: lab2-philosophers/benchmarks.csv" }
  - { label: "Sync reduction (stencil)", value: "1 barrier / 128 iters", source: "multicore: lab3-stencil/worker_thread.cpp:33,58 (T_BLOCK=128)" }
role: Sole author (s94810rr), three labs. Implemented NUMA first-touch pthreads vecadd; four-variant dining philosophers (coarse/fine × mutex/spinlock) with lock-ordering deadlock prevention; and a temporal-blocking 1-D Poisson stencil in both std::thread+std::barrier and OpenMP. Benchmarked on mcore72 (2× Xeon Platinum 8452Y, 72 cores, 2 NUMA nodes).
status: case-study
repo: { kind: case-study }
dates: "2025–26"
---

Three parallelism labs of increasing difficulty, all benchmarked on **mcore72** — a 2-socket machine, 2× Intel Xeon Platinum 8452Y, 72 physical cores split across two NUMA nodes (36 each), 144 hardware threads. The thread running through all three is the same one that matters in latency-sensitive systems: **what actually limits scaling is rarely the arithmetic — it's synchronisation, memory locality, and lock granularity.** Each claim below is measured on the real machine, not asserted.

## Lab 3 — a 1-D Poisson stencil that hits 132× (the hard one)

The marking baseline for this lab is a naive barrier-per-iteration parallelisation that tops out at 12–18×. The shipped solution reaches **132.5× at 72 threads** (std::thread + `std::barrier`) and **128.6× with OpenMP** — both lower-95%-CI bounds clear the top marking tier (>40× / >50×) by more than 2×. That gap is entirely engineering, and the core idea is **temporal blocking with cross-tile carry-over**.

The algorithm is Jacobi relaxation of `∂²V/∂x² = f(x)`: `V_{t+1}[i] = (V_t[i-1] + V_t[i+1] − f[i]) / 2`, iterated until every point changes by <1% (`threshold = 0.01`, capped at 2048 iters). The naive parallel version synchronises twice per iteration — a barrier after the compute sweep and another after the convergence reduction — and re-reads its neighbours from DRAM every single iteration. On a bandwidth-bound kernel that synchronisation and memory traffic, not the divide, is the whole cost.

**What the solution does instead.** Each thread owns a contiguous index range and a private halo-extended buffer of width `T_BLOCK` (=128) on each side. A "tile" runs 128 Jacobi iterations entirely in that thread's cache. The key correctness trick: the writeable range **shrinks by one cell on each side per iteration**, so after K local steps the owned `[my_start, my_end]` range is provably the exact iteration-K result — *regardless* of how the neighbours' halos have diverged inside their own buffers, because the divergence hasn't propagated far enough to reach the owned interior. That's why no per-iteration communication is needed.

Between tiles, a thread pulls back **only the two halo regions** from the global `value_old`; the owned interior is carried over from the previous tile's local buffer. This eliminates ~90% of the DRAM read traffic the simple temporal-block version would repeat every tile. The net synchronisation drop is dramatic: from 2 barriers per iteration to **1 barrier per 128 iterations — roughly a 256× reduction in barrier crossings**.

The hard part of this lab is correctness, not speed — "the easiest way to make a program go fast is to run a simpler but wrong algorithm." Four real bugs in the supplied skeleton are fixed deliberately:

- **Threads racing across iterations** → a single `std::barrier` per tile; its *completion function* runs once on one thread to do the global buffer swap, the termination decision, and the iteration count.
- **Per-thread `std::swap` of the shared vectors** (which swapped N times per iteration) → only the completion function swaps.
- **A thread declaring convergence and returning while others iterate** → one atomic `any_changed` reduction in the completion function decides termination for everyone.
- **The iteration count clobbered by whichever thread finished last** → recorded once, in the completion function.

Temporal blocking introduces its own subtle failure mode, which the changelog documents honestly: tile-boundary convergence detection can overshoot serial's exact stopping point by up to K−1 iterations. For small grids that converge to large-magnitude steady states, that drift exceeds the verifier's 0.02 absolute tolerance. The fix is a runtime `T_BLOCK` switch — K=128 at/above 4M elements (where the bench lives and convergence never triggers inside 2048 iters), K=1 (serial-equivalent semantics) below it. A functional sweep of **160 configurations** (5 forcing functions × 4 sizes × 4 thread counts × 2 binaries) passes after the grep that checks results was itself fixed — an earlier "60/60 pass" had been matching the wrong error string and masking real failures.

NUMA placement is handled by first-touch: each thread `madvise(MADV_DONTNEED)`s the page-aligned interior of its slice, then `memset`s it, re-faulting those pages onto its own socket instead of the main thread's. Threads pin to CPU `tid`, which on Linux lands them one-per-physical-core (0–35 on node 0, 36–71 on node 1) before any hyperthread siblings.

## Lab 1 — NUMA-aware vecadd, and why it stops at 30.7×

A pthreads `c[i] = a[i] + b[i]` over `double` arrays from 1M to 256M elements. The headline is **30.7× at 72 threads on 256M elements** — but the more interesting result is the *shape* of the scaling and the ceiling it runs into.

The decisive design choice is **parallel first-touch initialisation**. Each thread pins to a core and initialises *its own* slice (`init_thread_worker`) before the compute pass touches it (`vecadd_thread_worker`), so each page is physically allocated on the NUMA node that will later read it. Without this, a multi-socket machine pays a cross-socket interconnect hop on roughly half its accesses and the speedup collapses. Larger vectors scale better because the per-thread working set finally dwarfs the fixed thread-spawn and affinity overhead: 1M peaks at 4.8× (8 threads), 16M at 15.6× (32 threads), 256M at 30.7× (72 threads).

Two honest ceilings: the kernel is **memory-bandwidth bound** — 24 bytes of traffic (2 reads + 1 write) per add, arithmetic intensity ~0.04 FLOP/byte — so an estimated ~3% serial fraction caps the theoretical speedup near 33×, and 30.7× sits right against it. And scaling *degrades* past 72 threads (down to 21.3× at 288): hyperthreads share a core's load/store ports and don't add memory bandwidth, so logical threads buy nothing on a bandwidth-bound workload. Built deliberately at **-O0** to isolate parallel scaling from compiler auto-vectorisation — the goal of this lab is the threading curve, not peak throughput.

## Lab 2 — dining philosophers: granularity vs. contention, four ways

Four implementations of the classic problem — the cross product of lock **granularity** (one global lock vs. one lock per fork) and lock **type** (`pthread_mutex_t` vs. `pthread_spinlock_t`) — benchmarked at 2–64 threads, 5 runs each, on a fixed-runtime "meals eaten" throughput metric. Deadlock is prevented by **lock ordering**: a philosopher always acquires the lower-ID fork first, breaking the circular-wait Coffman condition.

The results are a clean lesson in what each lock costs:

| Variant | Behaviour | Peak |
|---|---|---|
| **Coarse-mutex** | One global lock serialises all eating; plateaus | ~123K @ 8T, flat after |
| **Coarse-spinlock** | Lower per-acquire cost, then busy-wait burns cores | ~231K @ 32T, then *declines* |
| **Fine-mutex** | Per-fork lock; non-adjacent philosophers eat in parallel | ~1,027K @ 64T |
| **Fine-spinlock** | Same, with cheaper short critical sections | **~1,039K @ 64T** (1,055K max) |

The point is reading *why*. Coarse locking serialises everything, so it can't beat single-threaded throughput no matter how many cores you add — extra threads only add contention. Fine-grained locking lets ⌊N/2⌋ non-adjacent philosophers eat concurrently, and throughput scales near-linearly to 64 threads. Spinlocks edge out mutexes at every granularity because the critical section is a handful of instructions — busy-waiting is cheaper than the OS block/wake round-trip when you'll get the lock in nanoseconds. The coarse-spinlock curve is the cautionary tale: it *wins* at moderate thread counts then falls off a cliff past 32, because once contention is high, busy-waiting just torches CPU cycles that a mutex would have yielded.

---

_Private UoM coursework (COMP35112, Chip Multiprocessors) — presented as a case study, no code link. Stencil headline speedups are marker values (serial_mean / lower-95%-CI parallel runtime); parenthetical lo-95% values are the conservative lower bounds on speedup. Vecadd and philosophers figures are means over ≥5 runs. All measured on mcore72; correctness proven by full functional sweeps, not assumed._
