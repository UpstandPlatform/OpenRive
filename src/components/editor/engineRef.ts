import type { StageEngine } from '@/lib/rive/engine';

/** The live stage engine, for panels that talk to the runtime (state machine preview). */
export const engineRef: { current: StageEngine | null } = { current: null };
