import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvestigation, commitPrediction, recordObservation, recordRepair, recordVerification, evidenceExport } from '../public/engine.js';
const setup={mode:'physical',setup:{confirmed:true,note:'Bench A, labels checked and branches traced; bypass closed, no output.'},criterion:{minRate:8,minSeconds:12}};
const evidence={note:'Checked on bench',configurationConfirmed:true,stateConfirmed:true,references:[{frameId:'capture',analysisIds:['analysis'],reviewIds:['analysis'],purpose:'reference_context_only'}]};
const create=()=>createInvestigation('physical-test',setup);
const observe=(s,t,o,extra={})=>recordObservation(commitPrediction(s,t),o,{...evidence,...extra});
const diagnosed=()=>observe(observe(create(),'bypass','flow',{measurement:{volumeMl:60,seconds:12}}),'valve','closed');
test('physical mode requires reviewed setup and a fixed measurable target',()=>{
  assert.throws(()=>createInvestigation('x',{mode:'physical'}),/Confirm/);
  for(const criterion of [{minRate:0,minSeconds:10},{minRate:10,minSeconds:1},{minRate:NaN,minSeconds:10}]) assert.throws(()=>createInvestigation('x',{...setup,criterion}),/positive/);
  assert.equal(create().events[0].source,'operator_report');
});
test('physical observations require notes and restored configuration',()=>{
  const s=commitPrediction(create(),'bypass');
  assert.throws(()=>recordObservation(s,'unknown'),/Describe/);
  assert.throws(()=>recordObservation(s,'unknown',{note:'cannot see'}),/configuration/);
  const next=recordObservation(s,'unknown',evidence);
  assert.equal(next.candidates.length,4);
  assert.equal(next.events.at(-1).source,'operator_report');
});
test('bypass result must match an actual entered collection interval',()=>{
  const s=commitPrediction(create(),'bypass');
  assert.throws(()=>recordObservation(s,'flow',evidence),/volume/);
  assert.throws(()=>recordObservation(s,'flow',{...evidence,measurement:{volumeMl:0,seconds:12}}),/agree/);
  assert.throws(()=>recordObservation(s,'no_flow',{...evidence,measurement:{volumeMl:0,seconds:3}}),/interval/);
});
test('valve state requires explicit independent confirmation',()=>{
  const s=observe(create(),'bypass','flow',{measurement:{volumeMl:30,seconds:12}});
  assert.throws(()=>observe(s,'valve','closed',{stateConfirmed:false}),/calibration/);
});
for(const [fault,bypass,testId,outcome] of [['valve_closed','flow','valve','closed'],['branch_kink','flow','valve','open'],['pump_off','no_flow','pump','stopped'],['inlet_blockage','no_flow','pump','running']]) {
 test(`operator evidence isolates ${fault} without the simulator`,()=>{
   let s=observe(create(),'bypass',bypass,{measurement:{volumeMl:bypass==='flow'?80:0,seconds:12}});
   s=observe(s,testId,outcome);assert.deepEqual(s.candidates,[fault]);
   assert.throws(()=>recordRepair(s),/Describe/);
   s=recordRepair(s,evidence);
   assert.throws(()=>recordVerification(s,{volumeMl:100,seconds:12}),/Describe/);
   const failed=recordVerification(s,{...evidence,volumeMl:95,seconds:12});assert.equal(failed.phase,'verification_failed');
   assert.equal(recordVerification(s,{...evidence,volumeMl:120,seconds:10}).phase,'verification_failed');
   s=recordVerification(s,{...evidence,volumeMl:96,seconds:12});assert.equal(s.phase,'complete');
   const exp=evidenceExport(s);assert.equal(exp.mode,'physical');assert.match(exp.provenance,/operator-reported/);
   assert.ok(!exp.events.some(e=>e.source==='simulated_rig'));
   assert.equal(exp.events.at(-1).rateMlPerSecond,8);
   assert.equal(exp.events.at(-1).references[0].frameId,'capture');
 });
}
test('contradictory physical observations cannot yield a repair',()=>{
 const s=observe(observe(create(),'bypass','flow',{measurement:{volumeMl:30,seconds:12}}),'pump','stopped');
 assert.equal(s.phase,'conflict');assert.throws(()=>recordRepair(s,evidence),/Isolate/);
});
