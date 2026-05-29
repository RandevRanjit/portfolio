// src/data/ascii.ts — per-project ASCII animation mapping
export const asciiBySlug = {
  'automaton-qts':  { kind: 'columns',  mode: 'ticker'   },
  'ca-accelerator': { kind: 'cellular', rule: 30          },
  'stump-cpu':      { kind: 'matrix'                      },
  'multicore':      { kind: 'columns',  mode: 'scaling'   },
  'oni':            { kind: 'stream',   mode: 'agent'     },
  'dawgit':         { kind: 'waveform'                    },
  'aero-lab':       { kind: 'gauge'                       },
  'racing-lab':     { kind: 'track',    mode: 'line'      },
  'fsai-sim':       { kind: 'track',    mode: 'cones'     },
  'commonroad':     { kind: 'track',    mode: 'road'      },
  'slit-sim':       { kind: 'columns',  mode: 'fringes'   },
  'carrlane':       { kind: 'stream',   mode: 'catalog'   },
} as const;

export type AsciiKind = typeof asciiBySlug[keyof typeof asciiBySlug]['kind'];
