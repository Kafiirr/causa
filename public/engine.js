/** The diagnostic engine receives observations, never the simulator's fault. */
export const HYPOTHESES = Object.freeze({
  valve_closed: { name: 'Main valve closed', component: 'valve', repair: 'Open the main valve', detail: 'The main branch is isolated by its valve.' },
  branch_kink: { name: 'Main tube restricted', component: 'tube', repair: 'Straighten the main tube', detail: 'A restriction interrupts the main branch.' },
  inlet_blockage: { name: 'Inlet obstructed', component: 'reservoir', repair: 'Clear the inlet obstruction', detail: 'The pump cannot draw water from the reservoir.' },
  pump_off: { name: 'Pump switched off', component: 'pump', repair: 'Switch the pump on', detail: 'The pump is not supplying either branch.' }
});

export const TESTS = Object.freeze({
  bypass: {
    name: 'Open the bypass', component: 'bypass',
    instruction: 'Temporarily open the bypass valve and observe the outlet. This separates a main-branch fault from a shared supply fault.',
    outcomes: { flow: 'Outlet flow returns', no_flow: 'Outlet still has no flow' },
    predictions: { valve_closed: 'flow', branch_kink: 'flow', inlet_blockage: 'no_flow', pump_off: 'no_flow' }
  },
  valve: {
    name: 'Inspect the main valve', component: 'valve',
    instruction: 'Inspect the main valve position. A closed valve isolates this branch; an open valve points to a tube restriction in this supported fault set.',
    outcomes: { closed: 'Main valve is closed', open: 'Main valve is open' },
    predictions: { valve_closed: 'closed', branch_kink: 'open', inlet_blockage: 'open', pump_off: 'open' }
  },
  pump: {
    name: 'Check pump operation', component: 'pump',
    instruction: 'Check whether the pump is running. In this supported fault set, a running pump with no bypass flow points to the inlet.',
    outcomes: { running: 'Pump is running', stopped: 'Pump is switched off' },
    predictions: { valve_closed: 'running', branch_kink: 'running', inlet_blockage: 'running', pump_off: 'stopped' }
  }
});

const copy = value => structuredClone(value);
const requireState = (condition, message) => { if (!condition) throw new Error(message); };
function event(state, type, payload) {
  state.events.push({ sequence: state.events.length + 1, at: new Date().toISOString(), type, ...copy(payload) });
}

export function createInvestigation(id = globalThis.crypto.randomUUID(), options = {}) {
  const mode = options.mode || 'simulation';
  requireState(['simulation', 'physical'].includes(mode), 'Unknown investigation mode.');
  if (mode === 'physical') {
    requireState(options.setup?.confirmed === true && options.setup?.note?.trim(), 'Confirm the rig topology, initial symptom and single-fault setup.');
    requireState(Number.isFinite(options.criterion?.minRate) && options.criterion.minRate > 0 && Number.isFinite(options.criterion?.minSeconds) && options.criterion.minSeconds >= 10, 'Set a positive required flow and an interval of at least 10 seconds.');
  }
  const state = { schema: 'causa.investigation.v1', id, mode, criterion: copy(options.criterion || { minRate: 10, minSeconds: 10 }), phase: 'investigating', candidates: Object.keys(HYPOTHESES), pending: null, events: [] };
  event(state, 'started', { observation: 'No outlet flow with bypass closed.', assumptions: ['One fault from the four supported causes.', 'Connections match the reviewed rig topology.', 'Tests return the rig to its initial configuration.'] });
  if (mode === 'physical') {
    state.setup = copy(options.setup);
    Object.assign(state.events[0], { source: 'operator_report', setup: copy(options.setup), criterion: copy(state.criterion) });
  }
  return state;
}

export function operatorEvidence(state, evidence, resetRequired = false) {
  if (state.mode !== 'physical') return {};
  requireState(evidence?.note?.trim(), 'Describe what you observed or did.');
  if (resetRequired) requireState(evidence.configurationConfirmed === true, 'Confirm the test configuration was restored.');
  return { note: evidence.note.trim().slice(0, 2000), configurationConfirmed: evidence.configurationConfirmed === true, references: copy(evidence.references || []) };
}
const sourceOf = state => state.mode === 'physical' ? 'operator_report' : 'simulated_rig';

/** Information gain uses a uniform hypothesis model, not calibrated confidence. */
export function informationGain(state, testId) {
  const test = TESTS[testId];
  requireState(Boolean(test), 'Unknown diagnostic test.');
  if (!state.candidates.length) return 0;
  const groups = {};
  for (const id of state.candidates) groups[test.predictions[id]] = (groups[test.predictions[id]] || 0) + 1;
  return Object.values(groups).reduce((sum, count) => { const p = count / state.candidates.length; return sum - p * Math.log2(p); }, 0);
}

export function nextTest(state) {
  if (state.phase !== 'investigating' || state.candidates.length < 2) return null;
  const completed = new Set(state.events.filter(e => e.type === 'observation' && e.outcome !== 'unknown').map(e => e.testId));
  return Object.keys(TESTS).filter(id => !completed.has(id)).sort((a, b) => informationGain(state, b) - informationGain(state, a))[0] || null;
}

export function commitPrediction(previous, testId) {
  requireState(previous.phase === 'investigating' && !previous.pending, 'Finish the current step before committing another prediction.');
  requireState(Boolean(TESTS[testId]), 'Unknown diagnostic test.');
  requireState(previous.candidates.length > 1, 'No further isolation test is needed.');
  const state = copy(previous);
  const predictions = Object.fromEntries(state.candidates.map(id => [id, TESTS[testId].predictions[id]]));
  state.pending = { testId, predictions };
  state.phase = 'awaiting_observation';
  event(state, 'prediction_committed', { testId, predictions });
  return state;
}

export function recordObservation(previous, outcome, evidence) {
  requireState(previous.phase === 'awaiting_observation' && previous.pending, 'Commit predictions before recording an observation.');
  const state = copy(previous);
  const { testId, predictions } = state.pending;
  requireState(outcome === 'unknown' || Object.hasOwn(TESTS[testId].outcomes, outcome), 'Unsupported observation.');
  const recorded = operatorEvidence(state, evidence, true);
  if (state.mode === 'physical' && testId === 'valve' && outcome !== 'unknown') requireState(evidence.stateConfirmed === true, 'Confirm valve state from a known indicator or calibration, not a guessed handle orientation.');
  if (state.mode === 'physical' && testId === 'bypass' && outcome !== 'unknown') {
    const m = evidence.measurement;
    requireState(Number.isFinite(m?.volumeMl) && m.volumeMl >= 0 && Number.isFinite(m?.seconds) && m.seconds >= state.criterion.minSeconds, 'Record collected volume over the agreed minimum interval.');
    requireState(outcome === (m.volumeMl > 0 ? 'flow' : 'no_flow'), 'The outcome must agree with the collected volume.');
    recorded.measurement = copy(m);
  }
  if (state.mode === 'physical' && testId === 'valve') recorded.stateConfirmed = evidence.stateConfirmed === true;
  const priorCandidates = [...state.candidates];
  if (outcome !== 'unknown') state.candidates = state.candidates.filter(id => predictions[id] === outcome);
  event(state, 'observation', { testId, outcome, source: sourceOf(state), ...recorded, priorCandidates, remainingCandidates: state.candidates });
  state.pending = null;
  state.phase = state.candidates.length === 0 ? 'conflict' : state.candidates.length === 1 ? 'diagnosed' : 'investigating';
  return state;
}

export function recordRepair(previous, evidence) {
  requireState(['diagnosed', 'verification_failed'].includes(previous.phase) && previous.candidates.length === 1, 'Isolate a supported fault before attempting its repair.');
  const state = copy(previous);
  event(state, 'repair_attempted', { hypothesis: state.candidates[0], instruction: HYPOTHESES[state.candidates[0]].repair, source: sourceOf(state), ...operatorEvidence(state, evidence) });
  state.phase = 'awaiting_verification';
  return state;
}

export function recordVerification(previous, measurement) {
  requireState(previous.phase === 'awaiting_verification', 'Attempt the repair before verifying operation.');
  const { volumeMl, seconds } = measurement;
  requireState(Number.isFinite(volumeMl) && volumeMl >= 0 && Number.isFinite(seconds) && seconds > 0, 'A valid volume and duration are required.');
  const state = copy(previous);
  const { minRate, minSeconds } = state.criterion;
  const recorded = operatorEvidence(state, measurement, true);
  const passed = seconds >= minSeconds && volumeMl / seconds >= minRate;
  event(state, 'verification', { source: sourceOf(state), ...recorded, volumeMl, seconds, rateMlPerSecond: volumeMl / seconds, criterion: `At least ${minRate} mL/s over an interval of at least ${minSeconds} seconds.`, passed });
  state.phase = passed ? 'complete' : 'verification_failed';
  return state;
}

export function evidenceExport(state, attachments = []) {
  return { ...copy(state), exportedAt: new Date().toISOString(), provenance: state.mode === 'physical' ? 'Physical test outcomes, repairs and measurements are operator-reported. Camera analysis and reviews are reference context, not independent verification of physical state or repair.' : 'Diagnostic observations and flow measurements are simulated. Camera attachments are user captures, not model-verified observations.', attachments: copy(attachments) };
}
