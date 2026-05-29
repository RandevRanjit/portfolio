---
title: Multicore Computing Labs
tagline: Measured parallelism on 72 cores — NUMA-aware pthreads, fine-grained spinlock dining philosophers, and a temporal-blocking stencil.
order: 6
buckets: [systems]
spokes:
  - { id: finance, role: flagship, blurb: "30.7× pthreads speedup on 72 cores + ~1.04M meals/s fine-spinlock — the parallelism story directly readable to an HFT engineer." }
stack: [C, "C++", pthreads, OpenMP]
metrics:
  - { label: "Vecadd speedup", value: "30.7× on 72 cores", source: "audit §comp35112 (statistics.csv)" }
  - { label: "Fine-spinlock throughput", value: "~1,039K meals/s @ 64T", source: "audit §comp35112 (benchmarks.csv, fine-spinlock)" }
  - { label: "Serial fraction", value: "~3% (bandwidth-bound)", source: "audit §comp35112 (03_results.tex:4)" }
role: Sole author (three labs). Implemented NUMA first-touch affinity vecadd, fine-grained spinlock dining philosophers with lock-ordering, and a temporal-blocking std::barrier stencil. Benchmarked on mcore72 (72-core, 2-socket NUMA machine).
status: case-study
repo: { kind: case-study }
dates: "2025–26"
---

Three progressively harder parallelism labs, all benchmarked on **mcore72** (72-core, 2-socket NUMA,
36 cores per socket):

**Lab 1 — pthreads vecadd with NUMA first-touch.**
Each thread initialises its own array slice (`init_thread_worker`) before compute (`vecadd_thread_worker`),
with `pthread_setaffinity_np` pinning to keep data local. Result: **30.7× at 72 threads** on a 256M
element array — a known memory-bandwidth-bound ceiling (24 bytes/op); the ~3% serial fraction
accounts for the gap from the 33× theoretical maximum.

**Lab 2 — dining philosophers.**
Four variants (coarse-mutex, coarse-spinlock, fine-mutex, fine-spinlock). Deadlock prevention via
lock-ordering (always acquire lower-ID fork first). Fine-spinlock uses a per-fork `pthread_spinlock_t`
— the correct primitive for a short critical section — and achieves **~1,039K meals/s at 64 threads**.
Coarse-mutex plateaus around 8 threads; understanding *why* (lock contention vs. critical-section length)
is the point.

**Lab 3 — 1-D Poisson stencil (std::thread + std::barrier / OpenMP).**
Jacobi relaxation to convergence (<1% change, max 2K iters). `std::barrier` completion function handles
global swap + convergence check + termination. Temporal blocking (`T_BLOCK=128`) cuts DRAM reads
~90% for arrays ≥4M; per-thread CPU pinning + NUMA first-touch via `madvise(MADV_DONTNEED)` + `memset`.

One audit finding worth noting: naive/opt/SIMD vecadd are within ±3% — the kernel is
memory-bandwidth-bound and `-O3` auto-vectorises; hand-written SIMD adds nothing here.
Knowing when SIMD won't help is as important as knowing when it will.

_Private UoM coursework — presented as a case study, no code link._
