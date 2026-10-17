import test from 'node:test';
import assert from 'node:assert/strict';
import { HYPOTHESES, createInvestigation, nextTest, informationGain, commitPrediction, recordObservation, recordRepair, recordVerification, evidenceExport } from '../dist/engine.js';
import { SimulatedRig } from '../dist/rig.js';

function isolate(fault) {
  const rig = new SimulatedRig(fault);
  let state = createInvestigation(`test-${fault}`);
  let attempts = 0;
  while (state.phase === 'investigating' && attempts++ < 5) {
    const id = nextTest(state);
    state = commitPrediction(state, id);
    state = recordObservation(state, rig.runTest(id));
  }
  return { state, rig };
}

for (const fault of Object.keys(HYPOTHESES)) {
  test(`blind planner isolates ${fault} and verifies its repair`, () => {
    let { state, rig } = isolate(fault);
    assert.equal(state.phase, 'diagnosed');
    assert.deepEqual(state.candidates, [fault]);
    assert.equal(state.events.filter(e => e.type === 'observation').length, 2);
    for (let i = 0; i < state.events.length; i++) {
      if (state.events[i].type === 'observation') {
        assert.equal(state.events[i - 1].type, 'prediction_committed');
        assert.equal(state.events[i - 1].testId, state.events[i].testId);
      }
    }
    rig.repair(state.candidates[0]);
    state = recordRepair(state);
    assert.equal(state.phase, 'awaiting_verification');
    state = recordVerification(state, rig.measure());
    assert.equal(state.phase, 'complete');
    assert.equal(state.events.at(-1).passed, true);
  });
}

test('first experiment maximizes discrimination under the stated hypothesis model', () => {
  const state = createInvestigation();
  assert.equal(nextTest(state), 'bypass');
  assert.equal(informationGain(state, 'bypass'), 1);
  assert.ok(informationGain(state, 'pump') < 1);
});

test('observations cannot be recorded without a prior prediction', () => {
  assert.throws(() => recordObservation(createInvestigation(), 'flow'), /Commit predictions/);
});

test('uncertain observations preserve every candidate and permit repeating the test', () => {
  let state = createInvestigation();
  const original = [...state.candidates];
  state = commitPrediction(state, 'bypass');
  state = recordObservation(state, 'unknown');
  assert.deepEqual(state.candidates, original);
  assert.equal(state.phase, 'investigating');
  assert.equal(nextTest(state), 'bypass');
  assert.equal(state.events.at(-1).outcome, 'unknown');
});

test('contradictory observations keep the case unresolved', () => {
  let state = recordObservation(commitPrediction(createInvestigation(), 'bypass'), 'flow');
  state = recordObservation(commitPrediction(state, 'pump'), 'stopped');
  assert.equal(state.phase, 'conflict');
  assert.deepEqual(state.candidates, []);
  assert.equal(nextTest(state), null);
  assert.throws(() => recordRepair(state), /Isolate/);
  assert.throws(() => recordVerification(state, { volumeMl: 120, seconds: 10 }), /Attempt the repair/);
});

test('diagnosis and repair alone never mark operation verified', () => {
  const { state } = isolate('branch_kink');
  assert.equal(state.phase, 'diagnosed');
  assert.throws(() => recordVerification(state, { volumeMl: 120, seconds: 10 }), /Attempt the repair/);
  assert.equal(recordRepair(state).phase, 'awaiting_verification');
});

test('failed and too-short flow checks cannot close an investigation', () => {
  const state = recordRepair(isolate('pump_off').state);
  for (const measurement of [{ volumeMl: 0, seconds: 10 }, { volumeMl: 99, seconds: 10 }, { volumeMl: 120, seconds: 5 }]) {
    const next = recordVerification(state, measurement);
    assert.equal(next.phase, 'verification_failed');
    assert.equal(next.events.at(-1).passed, false);
  }
  assert.equal(recordVerification(state, { volumeMl: 100, seconds: 10 }).phase, 'complete');
});

test('invalid measurement values cannot become successful evidence', () => {
  const state = recordRepair(isolate('pump_off').state);
  for (const measurement of [{ volumeMl: Infinity, seconds: 10 }, { volumeMl: -1, seconds: 10 }, { volumeMl: 120, seconds: 0 }, { volumeMl: '120', seconds: 10 }, { volumeMl: 120, seconds: NaN }]) {
    assert.throws(() => recordVerification(state, measurement), /valid volume/);
  }
});

test('wrong simulated repairs do not restore flow', () => {
  const rig = new SimulatedRig('valve_closed');
  rig.repair('pump_off');
  assert.equal(rig.measure().volumeMl, 0);
  rig.repair('valve_closed');
  assert.equal(rig.measure().volumeMl, 120);
});

test('prediction commitments and observations do not mutate historical states', () => {
  const original = createInvestigation();
  const committed = commitPrediction(original, 'bypass');
  const snapshot = structuredClone(committed);
  const observed = recordObservation(committed, 'flow');
  assert.equal(original.events.length, 1);
  assert.equal(original.pending, null);
  assert.deepEqual(committed, snapshot);
  assert.equal(observed.events.length, 3);
});

test('unsupported actions and duplicate commitments are rejected', () => {
  const state = createInvestigation();
  assert.throws(() => commitPrediction(state, 'invented'), /Unknown diagnostic test/);
  assert.throws(() => recordRepair(state), /Isolate/);
  const committed = commitPrediction(state, 'bypass');
  assert.throws(() => commitPrediction(committed, 'pump'), /Finish the current step/);
  assert.throws(() => recordObservation(committed, 'invented'), /Unsupported observation/);
  assert.throws(() => new SimulatedRig('invented'), /Unknown rig fault/);
});

test('exports disclose simulation and preserve uncertainty and capture provenance', () => {
  const state = recordObservation(commitPrediction(createInvestigation(), 'bypass'), 'unknown');
  const capture = { type: 'camera_reference', analyzed: false, dataUrl: 'data:image/jpeg;base64,test' };
  const exported = evidenceExport(state, [capture]);
  assert.equal(exported.mode, 'simulation');
  assert.match(exported.provenance, /not model-verified/);
  assert.equal(exported.events.at(-1).outcome, 'unknown');
  assert.equal(exported.attachments[0].analyzed, false);
  exported.candidates.pop();
  assert.equal(state.candidates.length, 4);
});

test('the environment exposes no fault property to the planner', () => {
  const rig = new SimulatedRig('inlet_blockage');
  assert.deepEqual(Object.keys(rig), []);
  assert.equal(rig.fault, undefined);
  assert.equal(JSON.stringify(rig), '{}');
});
