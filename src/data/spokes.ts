// src/data/spokes.ts
export type SpokeId = 'finance' | 'drone' | 'motorsport';
export interface Spoke {
  id: SpokeId; label: string; accentVar: string;
  intro: string;            // framing copy
  order: string[];          // project slugs, flagship-first
  gaps?: string[];          // "what I'd build next" (finance only)
}
export const spokes: Record<SpokeId, Spoke> = {
  finance: {
    id: 'finance', label: 'Finance / Quant', accentVar: 'var(--accent-finance)',
    intro: 'Low-latency systems across the hardware/software boundary — FPGA RTL closed on real silicon, measured parallelism, and a quant stack built for correctness under real constraints.',
    order: ['automaton-qts', 'ca-accelerator', 'stump-cpu', 'multicore', 'oni', 'carrlane'],
    gaps: [
      'Fixed-point / integer-tick pricing (today everything is float)',
      'A price-time-priority limit-order-book matching engine',
      'Hand-written SIMD and a lock-free SPSC ring buffer',
    ],
  },
  drone: {
    id: 'drone', label: 'Drone / Music', accentVar: 'var(--accent-drone)',
    intro: 'Real-time control, embedded hardware, and creative tooling — from a quadrotor flight stack and a programmable FPGA accelerator to version control for Ableton sessions.',
    order: ['aero-lab', 'dawgit', 'ca-accelerator', 'fsai-sim', 'stump-cpu', 'oni', 'slit-sim'],
  },
  motorsport: {
    id: 'motorsport', label: 'Motorsport', accentVar: 'var(--accent-motor)',
    intro: 'Vehicle dynamics, model-predictive control, and real-time simulation — physics-grounded models turned into engineered, instrumented, testable algorithms.',
    order: ['racing-lab', 'fsai-sim', 'commonroad', 'aero-lab'],
  },
};
