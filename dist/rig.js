import { HYPOTHESES } from './engine.js';

/** A separate environment adapter. The planner receives only runTest results. */
export class SimulatedRig {
  #fault;
  #repaired = false;
  constructor(fault) {
    if (!Object.hasOwn(HYPOTHESES, fault)) throw new Error('Unknown rig fault.');
    this.#fault = fault;
  }
  runTest(testId) {
    if (testId === 'bypass') return ['valve_closed', 'branch_kink'].includes(this.#fault) || this.#repaired ? 'flow' : 'no_flow';
    if (testId === 'valve') return this.#fault === 'valve_closed' && !this.#repaired ? 'closed' : 'open';
    if (testId === 'pump') return this.#fault === 'pump_off' && !this.#repaired ? 'stopped' : 'running';
    throw new Error('Unsupported rig test.');
  }
  repair(hypothesis) { if (hypothesis === this.#fault) this.#repaired = true; }
  measure(seconds = 10) { return { volumeMl: this.#repaired ? seconds * 12 : 0, seconds }; }
}

export function randomFault() {
  const values = Object.keys(HYPOTHESES);
  const random = new Uint32Array(1);
  globalThis.crypto.getRandomValues(random);
  return values[random[0] % values.length];
}
