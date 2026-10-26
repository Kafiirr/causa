import { TESTS, createInvestigation, commitPrediction, recordObservation, informationGain } from './engine.js';
import { PLANNER_MODELS } from './model-config.js';

export const PROMPT_VERSION = 'causa.test-planner.v1';
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

// A small, explicit projection: never send camera payloads, simulator faults, or API keys.
export function planningContext(state, availableTests = Object.keys(TESTS)) {
  requireValue(state.mode === 'physical' && state.phase === 'investigating' && !state.pending, 'Planning requires an open physical investigation.');
  return {
    caseId: state.id, revision: state.events.length, mode: state.mode,
    setup: { confirmed: state.setup.confirmed, note: state.setup.note }, criterion: { ...state.criterion },
    availableTests: [...availableTests],
    observations: state.events.filter(e => e.type === 'observation').map(e => ({
      testId: e.testId, outcome: e.outcome, note: e.note,
      configurationConfirmed: e.configurationConfirmed,
      ...(e.measurement ? { measurement: { ...e.measurement } } : {}),
      ...(e.stateConfirmed !== undefined ? { stateConfirmed: e.stateConfirmed } : {})
    }))
  };
}

// Recompute candidates from reported observations; never trust a submitted candidate list.
export function validatePlanningContext(input) {
  requireValue(input?.mode === 'physical' && /^[a-zA-Z0-9_-]{1,80}$/.test(input.caseId || '') && Number.isSafeInteger(input.revision) && input.revision > 0, 'Invalid planning context.');
  requireValue(text(input.setup?.note, 2000), 'Describe the reviewed rig in at most 2000 characters.');
  requireValue(Array.isArray(input.observations) && input.observations.length <= 24, 'At most 24 observations can be planned from.');
  requireValue(input.revision >= 1 + input.observations.length * 2, 'Invalid evidence revision.');
  requireValue(Array.isArray(input.availableTests) && input.availableTests.length > 0 && input.availableTests.length <= 3 && new Set(input.availableTests).size === input.availableTests.length && input.availableTests.every(id => Object.hasOwn(TESTS, id)), 'Select at least one supported test you can perform.');
  let state = createInvestigation(input.caseId, { mode: 'physical', setup: input.setup, criterion: input.criterion });
  for (const observation of input.observations) {
    requireValue(observation && Object.hasOwn(TESTS, observation.testId) && text(observation.note, 2000), 'Invalid reported observation.');
    state = recordObservation(commitPrediction(state, observation.testId), observation.outcome, observation);
  }
  requireValue(state.phase === 'investigating', 'The evidence is already isolated or conflicting; review it before planning.');
  const context = planningContext(state, input.availableTests);
  context.revision = input.revision;
  const tests = input.availableTests.filter(id => informationGain(state, id) > 0).map(id => ({
    id, name: TESTS[id].name, component: TESTS[id].component,
    predictions: Object.fromEntries(state.candidates.map(c => [c, TESTS[id].predictions[c]])),
    informationGainBits: informationGain(state, id)
  }));
  requireValue(tests.length > 0, 'None of the available tests distinguishes the remaining causes. Review test access or the setup.');
  return { context, candidates: state.candidates, tests };
}

export function validatePlan(value, input) {
  const { tests } = validatePlanningContext(input);
  const test = tests.find(t => t.id === value?.testId);
  requireValue(test && text(value.rationale, 1200), 'The model must propose an available, informative test and a reason.');
  requireValue(Object.keys(value).length === 3 && ['testId', 'rationale', 'predictions'].every(k => Object.hasOwn(value, k)), 'The model returned unsupported plan fields.');
  requireValue(value.predictions && typeof value.predictions === 'object' && !Array.isArray(value.predictions) && Object.keys(value.predictions).length === Object.keys(test.predictions).length && Object.entries(test.predictions).every(([k,v]) => value.predictions[k] === v), 'Model predictions disagree with the reviewed fault model.');
  return { testId: test.id, rationale: value.rationale.trim(), predictions: { ...test.predictions } };
}

export function recordPlan(state, proposal, availableTests) {
  const context = planningContext(state, availableTests);
  requireValue(JSON.stringify(proposal.input) === JSON.stringify(context), 'This proposal belongs to an earlier case, evidence revision, or test selection. Request a new plan.');
  requireValue(proposal.schema === PROMPT_VERSION && Object.hasOwn(PLANNER_MODELS, proposal.provider) && proposal.model === PLANNER_MODELS[proposal.provider] && text(proposal.id, 80) && text(proposal.rawOutput, 8000) && Number.isFinite(Date.parse(proposal.createdAt)), 'Invalid model provenance.');
  const plan = validatePlan(proposal.plan, context);
  const rawPlan = validatePlan(JSON.parse(proposal.rawOutput), context);
  requireValue(JSON.stringify(rawPlan) === JSON.stringify(plan), 'The stored model response does not match the proposal.');
  const next = structuredClone(state);
  next.events.push({ sequence: next.events.length + 1, at: new Date().toISOString(), type: 'plan_proposed', source: 'model_proposal', proposal: structuredClone(proposal) });
  return next;
}

export function decidePlan(state, decision) {
  const last = state.events.at(-1);
  requireValue(state.phase === 'investigating' && last?.type === 'plan_proposed' && ['accepted','declined'].includes(decision), 'There is no pending proposal to review.');
  const proposal = last.proposal;
  const context = planningContext(state, proposal.input.availableTests);
  context.revision--;
  requireValue(JSON.stringify(context) === JSON.stringify(proposal.input), 'The evidence changed after this proposal.');
  const plan = validatePlan(proposal.plan, context);
  const next = structuredClone(state);
  next.events.push({ sequence: next.events.length + 1, at: new Date().toISOString(), type: 'plan_decision', source: 'operator_review', proposalId: proposal.id, decision });
  return decision === 'accepted' ? commitPrediction(next, plan.testId) : next;
}
