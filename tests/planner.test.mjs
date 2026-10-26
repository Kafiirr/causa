import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvestigation, commitPrediction, recordObservation, evidenceExport } from '../public/engine.js';
import { PLANNER_MODELS } from '../public/model-config.js';
import { planningContext, validatePlanningContext, validatePlan, recordPlan, decidePlan, PROMPT_VERSION } from '../public/planning.js';
import { createPlannerHandler, plannerStatus } from '../server/planner.mjs';

const initial = () => createInvestigation('case-1', { mode:'physical', setup:{confirmed:true,note:'Reviewed bench with main and bypass branches.'}, criterion:{minRate:10,minSeconds:10} });
const context = () => planningContext(initial());
const output = (input=context(), testId='bypass') => ({testId,rationale:'Separate main-branch causes from shared supply causes.',predictions:validatePlanningContext(input).tests.find(t=>t.id===testId)?.predictions});
const request = (input=context(), options={}) => new Request('https://causa.test/api/planner',{method:'POST',headers:{origin:'https://causa.test','content-type':'application/json','oai-authenticated-user-id':'operator'},body:JSON.stringify(input),...options});
const reply = (value=output(), extra={}) => new Response(JSON.stringify({model:'fixture-model',choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}],usage:{prompt_tokens:300,completion_tokens:80},...extra}));
const fixture = (input=context()) => ({schema:PROMPT_VERSION,id:'plan-1',provider:'baseten',model:PLANNER_MODELS.baseten,createdAt:new Date().toISOString(),input,rawOutput:JSON.stringify(output(input)),plan:output(input),usage:{modelCalls:1}});

test('provider IDs are exact and perception/default Meta is separate from Baseten',()=>{
 assert.equal(PLANNER_MODELS.baseten,'meta-models/muse-spark-open-1026');
 assert.equal(plannerStatus({MODEL_API_KEY:'secret'}).model,'muse-spark-1.3');
 assert.deepEqual(plannerStatus({CAUSA_PLANNER_PROVIDER:'baseten',MODEL_API_KEY:'secret'}),{provider:'baseten',model:'meta-models/muse-spark-open-1026',configured:false,accessVerified:false,promptVersion:PROMPT_VERSION});
 assert.throws(()=>plannerStatus({CAUSA_PLANNER_PROVIDER:'other'}),/meta or baseten/);
});

for(const provider of ['meta','baseten']) test(`${provider} transport uses its pinned ID, endpoint and credential`,async()=>{
 let count=0;
 const handler=createPlannerHandler({rateBuckets:new Map(),fetcher:async(url,options)=>{
   count++;assert.equal(url,provider==='meta'?'https://api.meta.ai/v1/chat/completions':'https://inference.baseten.co/v1/chat/completions');
   assert.equal(options.headers.Authorization,`Bearer ${provider}-secret`);
   const payload=JSON.parse(options.body);assert.equal(payload.model,PLANNER_MODELS[provider]);assert.equal(payload.max_tokens,4096);assert.equal(payload.max_completion_tokens,undefined);
   const data=JSON.parse(payload.messages[1].content);assert.deepEqual(data.candidates,Object.keys(output().predictions));assert.equal(data.context.fault,undefined);
   return reply();
 }});
 const response=await handler(request({...context(),fault:'pump_off',candidates:['pump_off'],image:'not-to-be-sent'}),{CAUSA_PLANNER_PROVIDER:provider,MODEL_API_KEY:'meta-secret',BASETEN_API_KEY:'baseten-secret'});
 assert.equal(response.status,200);const proposal=await response.json();
 assert.equal(proposal.model,PLANNER_MODELS[provider]);assert.equal(proposal.reportedModel,'fixture-model');assert.equal(count,1);
 assert.equal(JSON.stringify(proposal).includes('secret'),false);assert.deepEqual(proposal.input,context());
 assert.equal(proposal.modelInput.context.image,undefined);assert.equal(proposal.usage.modelCalls,1);
});

test('Baseten never falls back to Meta or the generic alias on missing credentials or upstream denial',async()=>{
 let calls=0;const handler=createPlannerHandler({rateBuckets:new Map(),fetcher:async()=>{calls++;return new Response('private upstream detail',{status:403});}});
 assert.equal((await handler(request(),{CAUSA_PLANNER_PROVIDER:'baseten',MODEL_API_KEY:'secret'})).status,503);assert.equal(calls,0);
 const response=await handler(request(),{CAUSA_PLANNER_PROVIDER:'baseten',BASETEN_API_KEY:'secret',MODEL_API_KEY:'other'});
 assert.equal(response.status,502);assert.equal(calls,1);assert.ok(!(await response.text()).includes('private upstream detail'));
});

test('physical evidence is replayed and unknown results retain candidates',()=>{
 let state=initial();state=recordObservation(commitPrediction(state,'bypass'),'unknown',{note:'Cup obscured',configurationConfirmed:true});
 assert.equal(validatePlanningContext(planningContext(state)).candidates.length,4);
 state=recordObservation(commitPrediction(state,'bypass'),'flow',{note:'Collected water',configurationConfirmed:true,measurement:{volumeMl:40,seconds:10}});
 const validated=validatePlanningContext(planningContext(state));assert.deepEqual(validated.candidates,['valve_closed','branch_kink']);assert.deepEqual(validated.tests.map(t=>t.id),['valve']);
 assert.throws(()=>validatePlanningContext(planningContext(state,['pump'])),/None of the available/);
});

test('server refuses unverifiable physical reports and impossible histories',()=>{
 const bad=context();bad.revision=3;bad.observations=[{testId:'valve',outcome:'closed',note:'Looks closed',configurationConfirmed:true}];
 assert.throws(()=>validatePlanningContext(bad),/indicator or calibration/);
 bad.observations=[{testId:'bypass',outcome:'flow',note:'Collected water',configurationConfirmed:true,measurement:{volumeMl:0,seconds:10}}];
 assert.throws(()=>validatePlanningContext(bad),/agree/);
 bad.observations[0].measurement={volumeMl:10,seconds:1};assert.throws(()=>validatePlanningContext(bad),/interval/);
 assert.throws(()=>planningContext(createInvestigation('simulation')),/physical/);
});

test('reject hallucinated tests, unavailable tests, invented predictions, missing candidates and action fields',()=>{
 for(const value of [{...output(),testId:'replace_pump'},{...output(),predictions:{valve_closed:'flow'}},{...output(),predictions:{...output().predictions,pump_off:'flow'}},{...output(),repair:'open valve'}]) assert.throws(()=>validatePlan(value,context()));
 assert.throws(()=>validatePlan(output(),{...context(),availableTests:['pump']}));
});

test('proposal alone changes no candidates or pending prediction; explicit acceptance commits exact predictions',()=>{
 const state=initial();const proposed=recordPlan(state,fixture(),context().availableTests);
 assert.equal(proposed.phase,'investigating');assert.equal(proposed.pending,null);assert.deepEqual(proposed.candidates,state.candidates);assert.equal(state.events.length,1);
 const accepted=decidePlan(proposed,'accepted');assert.equal(accepted.phase,'awaiting_observation');
 assert.deepEqual(accepted.events.map(e=>e.type),['started','plan_proposed','plan_decision','prediction_committed']);
 assert.deepEqual(accepted.pending.predictions,output().predictions);assert.equal(accepted.events[2].decision,'accepted');
 assert.equal(evidenceExport(accepted).events[1].proposal.model,PLANNER_MODELS.baseten);
 assert.equal(decidePlan(proposed,'declined').phase,'investigating');
});

test('reject stale case, changed evidence, changed access and mismatched output/provenance',()=>{
 const state=initial();
 assert.throws(()=>recordPlan({...state,id:'case-2'},fixture(),context().availableTests),/earlier case/);
 assert.throws(()=>recordPlan(state,fixture(),['valve']),/earlier case/);
 assert.throws(()=>recordPlan(state,{...fixture(),model:'meta-models/muse-spark-open'},context().availableTests),/provenance/);
 assert.throws(()=>recordPlan(state,{...fixture(),rawOutput:JSON.stringify(output(context(),'pump'))},context().availableTests),/does not match/);
 const changed=recordObservation(commitPrediction(state,'bypass'),'unknown',{note:'Cannot see',configurationConfirmed:true});
 assert.throws(()=>recordPlan(changed,fixture(),context().availableTests),/earlier case/);
 const pending=recordPlan(state,fixture(),context().availableTests);pending.setup.note='Another rig';assert.throws(()=>decidePlan(pending,'accepted'),/evidence changed/);
});

test('authentication, origin, size and context validation prevent upstream calls',async()=>{
 let calls=0;const handler=createPlannerHandler({rateBuckets:new Map(),fetcher:async()=>{calls++;return reply();}});const env={MODEL_API_KEY:'secret'};
 assert.equal((await handler(request(context(),{headers:{}}),env)).status,401);
 assert.equal((await handler(request(context(),{headers:{'oai-authenticated-user-id':'operator',origin:'https://other.test'}}),env)).status,403);
 assert.equal((await handler(request({...context(),availableTests:[]}),env)).status,400);
 assert.equal((await handler(request({...context(),extra:'a'.repeat(65000)}),env)).status,400);assert.equal(calls,0);
});

test('malformed, truncated and oversized model responses cannot create plans',async()=>{
 for(const response of [reply({...output(),testId:'invented'}),reply(output(),{choices:[{message:{content:'{"testId":'},finish_reason:'length'}]}),new Response('x'.repeat(65001)),new Response('not JSON')]) {
  const handler=createPlannerHandler({rateBuckets:new Map(),fetcher:async()=>response});assert.equal((await handler(request(),{MODEL_API_KEY:'secret'})).status,502);
 }
});

test('one active request and four requests per minute, with reset after window',async()=>{
 let now=0, release;const handler=createPlannerHandler({clock:()=>now,rateBuckets:new Map(),fetcher:()=>new Promise(resolve=>{release=()=>resolve(reply());})});
 const env={MODEL_API_KEY:'secret'};
 const pending=handler(request(),env);while(!release)await new Promise(r=>setTimeout(r,1));
 assert.equal((await handler(request(),env)).status,429);release();assert.equal((await pending).status,200);
 for(let i=0;i<3;i++){release=null;const p=handler(request(),env);while(!release)await new Promise(r=>setTimeout(r,1));release();assert.equal((await p).status,200);}
 assert.equal((await handler(request(),env)).status,429);now=60001;release=null;const p=handler(request(),env);while(!release)await new Promise(r=>setTimeout(r,1));release();assert.equal((await p).status,200);
});
