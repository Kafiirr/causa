import { TESTS } from './engine.js';
import { planningContext, validatePlanningContext, recordPlan, decidePlan } from './planning.js';

let controller;
export function cancelPlanning() { controller?.abort(); controller = null; }

export function mountPlanner({ state, getState, update, actions }) {
  const panel = document.createElement('section'); panel.className = 'planner-panel';
  panel.setAttribute('aria-label', 'Model-assisted test planning');
  const proposal = state.events.at(-1)?.type === 'plan_proposed' ? state.events.at(-1).proposal : null;
  const heading = document.createElement('h4'); heading.textContent = proposal ? 'Review the proposed test' : 'Ask Muse for the next test';
  const description = document.createElement('p');
  description.textContent = 'Muse uses your setup notes, reported observations and available tests to propose a next step. You decide whether to commit it.';
  panel.append(heading, description);
  const status = document.createElement('p'); status.className = 'planner-status'; status.setAttribute('aria-live','polite'); panel.append(status);
  actions.prepend(panel);
  const button = (label, handler) => { const b = document.createElement('button'); b.type='button'; b.className='button primary'; b.textContent=label; b.onclick=handler; panel.append(b); return b; };
  if (proposal) {
    status.textContent = `${proposal.provider} · ${proposal.model} · ${proposal.usage.modelCalls} model call · proposal only`;
    const reason = document.createElement('p'); reason.id='planner-rationale'; reason.textContent=proposal.plan.rationale; panel.append(reason);
    const decide = value => { try { update(decidePlan(getState(),value)); } catch(error) { status.textContent=error.message; } };
    button('Accept plan and commit prediction',()=>decide('accepted'));
    button('Decline and choose a test',()=>decide('declined')).className='unclear-button';
    return;
  }
  const fieldset=document.createElement('fieldset'); const legend=document.createElement('legend');legend.textContent='Tests I can perform with the reviewed procedure';fieldset.append(legend);
  const boxes=[];
  for(const [id,test] of Object.entries(TESTS)) {
    const label=document.createElement('label');label.className='check-label';
    const input=document.createElement('input');input.type='checkbox';input.checked=true;input.value=id;input.id=`planner-access-${id}`;boxes.push(input);
    label.append(input,document.createTextNode(test.name));fieldset.append(label);
  }
  panel.append(fieldset);
  const errorNode=document.createElement('p');errorNode.id='planner-error';errorNode.setAttribute('role','alert');panel.append(errorNode);
  const available=()=>boxes.filter(b=>b.checked).map(b=>b.value);
  const c=new AbortController();controller=c;
  const current=()=>!c.signal.aborted && panel.isConnected && getState()===state;
  const requestButton=button('Propose next test',async()=>{
    errorNode.textContent='';
    let input;
    try { input=planningContext(state,available());validatePlanningContext(input); }
    catch(error) {errorNode.textContent=error.message;return;}
    requestButton.disabled=true;fieldset.disabled=true;requestButton.textContent='Muse is comparing the tests…';
    try {
      const response=await fetch('/api/planner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.any([c.signal,AbortSignal.timeout(35_000)])});
      const result=await response.json();
      if(!current()) return;
      if(!response.ok) throw new Error(result.error?.message || 'Planning failed. Choose a reviewed test below.');
      update(recordPlan(state,result,input.availableTests));
    } catch(error) {if(current()) errorNode.textContent=error.name==='TimeoutError'?'Planning timed out. Choose a reviewed test or try again.':error.message;}
    finally {if(current()){requestButton.disabled=false;fieldset.disabled=false;requestButton.textContent='Propose next test';}}
  });
  status.textContent='Checking planner configuration…';
  fetch('/api/planner',{signal:c.signal}).then(async response=>{
    const result=await response.json();if(!current())return;
    if(!response.ok)throw new Error(result.error?.message || 'Planner configuration unavailable.');
    status.textContent=`${result.provider} · ${result.model} · ${result.configured?'credential configured; access checked when you request a plan':'credential missing; use the reviewed test selector below'}`;
    if(!result.configured) requestButton.disabled=true;
  }).catch(error=>{if(current())status.textContent=error.message;});
}
