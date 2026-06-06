// src/data/sections.ts — 5-section taxonomy with broad reusable sub-categories.
// Curation + cross-listing live here (site-only). Canonical home = each project's
// `section` frontmatter field; a slug appearing under a different section here is cross-listed.
export type SectionId = 'quant' | 'drones' | 'motorsport' | 'music' | 'other';

export interface SectionGroup {
  category: string;   // broad reusable label
  slugs: string[];    // relevance-ordered project slugs
}
export interface Section {
  id: SectionId;
  label: string;
  accentVar: string;
  intro: string;
  groups: SectionGroup[];
  gaps?: string[];   // optional "NEXT / WHAT I'D BUILD" list (carried from the old finance spoke)
}

export const sectionOrder: SectionId[] = ['quant', 'drones', 'motorsport', 'music', 'other'];

export const sections: Record<SectionId, Section> = {
  quant: {
    id: 'quant', label: 'Quantitative Finance', accentVar: 'var(--accent-quant)',
    intro: 'Low-latency systems across the hardware/software boundary — a relation-typed trading research stack, FPGA RTL closed on real silicon, a RISC CPU, and measured parallelism.',
    groups: [
      { category: 'Research', slugs: ['automaton-qts'] },
      { category: 'Embedded Hardware', slugs: ['ca-accelerator', 'stump-cpu'] },
      { category: 'Systems', slugs: ['multicore'] },
    ],
    gaps: [
      'Fixed-point / integer-tick pricing (today everything is float)',
      'A price-time-priority limit-order-book matching engine',
      'Hand-written SIMD and a lock-free SPSC ring buffer',
    ],
  },
  drones: {
    id: 'drones', label: 'Drones', accentVar: 'var(--accent-drones)',
    intro: 'Real-time flight control and autonomy — a hand-rolled 6-DOF quadrotor stack with four racing controllers, a cinematic camera-drone track, and a driverless autonomy core.',
    groups: [
      { category: 'Control', slugs: ['aero-lab'] },
      { category: 'Autonomy', slugs: ['aubry', 'fsai-sim'] },
      { category: 'Embedded Hardware', slugs: ['ca-accelerator'] },
    ],
  },
  motorsport: {
    id: 'motorsport', label: 'Motorsport', accentVar: 'var(--accent-motorsport)',
    intro: 'Vehicle dynamics, interpretable control, and real-time simulation — the RRHC dissertation controller, a Formula Student AI stack, and a C++ vehicle-dynamics library.',
    groups: [
      { category: 'Control', slugs: ['racing-lab', 'aero-lab'] },
      { category: 'Simulation', slugs: ['fsai-sim', 'commonroad', 'fsai-unity'] },
    ],
  },
  music: {
    id: 'music', label: 'Music', accentVar: 'var(--accent-music)',
    intro: 'Creative tooling and generative work — version control for Ableton sessions, plus camera-drone and physically-based visual work at the art/engineering edge.',
    groups: [
      { category: 'Tooling', slugs: ['dawgit'] },
      { category: 'Creative', slugs: ['aubry', 'slit-sim'] },
    ],
  },
  other: {
    id: 'other', label: 'Other', accentVar: 'var(--accent-other)',
    intro: 'Systems, AI, and graphics that don\'t sit under one market — a local-LLM agent research rig, a production chatbot, and a GPU interference simulator.',
    groups: [
      { category: 'Systems & AI', slugs: ['oni', 'carrlane'] },
      { category: 'Creative', slugs: ['slit-sim', 'proce-tree'] },
    ],
  },
};
