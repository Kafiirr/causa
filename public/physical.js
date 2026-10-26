import { HYPOTHESES, TESTS, nextTest, commitPrediction, recordObservation, recordRepair, recordVerification } from './engine.js';
import { mountPlanner } from './planner-ui.js';
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = id => document.getElementById(id);
let activeReferences = [];
export function refreshPhysicalReferences(references) {
  activeReferences = references;
  const select = $('physical-reference');
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">No frame linked</option>' + references.map((r,i)=>`<option value="${i}">Capture ${i+1} · ${r.reviewIds.length} reviews</option>`).join('');
  select.value = selected;
}
export function solutionMarkup(state) {
  const physical = state.mode === 'physical';
  const cause = state.candidates.length === 1 ? HYPOTHESES[state.candidates[0]] : null;
  const check = state.events.findLast(e => e.type === 'verification');
  const observations = state.events.filter(e => e.type === 'observation' && e.outcome !== 'unknown');
  return `<div class="solution-heading"><span class="eyebrow">${physical ? 'PHYSICAL INVESTIGATION · OPERATOR EVIDENCE' : 'SIMULATION RESULT'}</span><span class="tag">${state.phase === 'complete' ? physical ? 'REPORTED CHECK PASSED' : 'SIMULATED CHECK PASSED' : state.phase === 'verification_failed' ? 'CHECK FAILED · CASE OPEN' : 'INVESTIGATION OPEN'}</span></div><h2>${cause ? esc(cause.name) : state.phase === 'conflict' ? 'Evidence conflicts with the supported causes' : 'Cause not yet isolated'}</h2><div class="solution-grid"><div><span>SUPPORTING EVIDENCE</span><p>${observations.length ? observations.map(e => `#${e.sequence} ${esc(TESTS[e.testId].outcomes[e.outcome])}`).join('<br>') : 'Commit a prediction, then record the test result.'}</p></div><div><span>REPAIR</span><p>${cause ? esc(cause.repair) : 'More evidence is needed before recommending a repair.'}</p></div><div><span>FUNCTIONAL CHECK</span><p>${check ? `${check.volumeMl} mL / ${check.seconds} s = ${(check.volumeMl/check.seconds).toFixed(2)} mL/s · ${check.passed ? 'passed' : 'failed'}` : 'Pending — identifying a cause does not close the case.'}</p></div></div><p class="solution-limit">${physical ? 'Suspected cause within the reviewed four-cause, single-fault model. Measurements and repairs are reported by the operator; camera analysis does not independently verify them.' : 'The simulator supplies the observations and measurements for this practice case.'}</p>`;
}

function formMarkup(extra, references, submit) {
  return `<form id="physical-evidence" class="evidence-form">${extra}<label for="physical-note">Evidence notes</label><textarea id="physical-note" maxlength="2000" required placeholder="Describe what you actually observed or did, and how you checked it."></textarea><label for="physical-reference">Link a reference frame (optional)</label><select id="physical-reference"><option value="">No frame linked</option>${references.map((r,i)=>`<option value="${i}">Capture ${i+1} · ${r.reviewIds.length} reviews</option>`).join('')}</select><p>Links preserve image and review context. They do not turn a model candidate into a physical observation.</p><button class="button primary" type="submit">${submit}<span aria-hidden="true">↗</span></button><p id="physical-error" role="alert"></p></form>`;
}
const measurements = (minimum) => `<div class="measurement-fields"><label>Collected volume (mL)<input id="physical-volume" type="number" required min="0" step="any"></label><label>Measured interval (seconds)<input id="physical-seconds" type="number" required min="${minimum}" step="any"></label></div>`;
const reset = text => `<label class="check-label"><input id="physical-reset" type="checkbox" required> ${text}</label>`;

export function renderPhysicalStep({ state, getState, update, references, selectComponent, predictions, showEvidence, newCase, inspect }) {
  activeReferences = references;
  const content = $('experiment-content');
  const actions = $('experiment-actions');
  const button = (label, fn) => { const b = document.createElement('button'); b.className='button primary'; b.textContent=label; b.onclick=fn; actions.append(b); };
  const form = (extra, label, handler) => {
    actions.innerHTML = formMarkup(extra, references, label);
    $('physical-evidence').onsubmit = e => {
      e.preventDefault();
      try {
        const selected = $('physical-reference').value;
        handler({ note: $('physical-note').value, configurationConfirmed: $('physical-reset')?.checked === true, stateConfirmed: $('physical-state')?.checked === true, references: selected === '' ? [] : [activeReferences[Number(selected)]] });
      } catch (error) { $('physical-error').textContent = error.message; }
    };
  };
  if (['investigating','awaiting_observation'].includes(state.phase)) {
    const committed = state.phase === 'awaiting_observation';
    const proposal = state.events.at(-1)?.type === 'plan_proposed' ? state.events.at(-1).proposal : null;
    const testId = committed ? state.pending.testId : proposal?.plan.testId || nextTest(state);
    if (!testId) { content.innerHTML='<h3>More evidence needed.</h3><p>The available tests cannot isolate a cause. Review your setup before opening a new case.</p>'; button('Review evidence',showEvidence); return; }
    selectComponent(TESTS[testId].component);
    const guidance = {
      bypass: `Keep the main valve unchanged. Open only the bypass, collect outlet water in an empty marked cup for at least ${state.criterion.minSeconds} measured seconds, then close the bypass. Record the actual volume. Any collected water counts as flow for this isolation test; the final check uses your agreed flow target.`,
      valve: 'Keep the bypass closed. Determine the main valve state using its known open/closed indicator or a calibration you have checked. A handle angle or a still photo alone is insufficient. Do not change the valve during inspection.',
      pump: 'Keep both valve settings unchanged. Check whether the pump is actually running using your reviewed procedure, such as its operation indicator and audible operation. If it is powered but stalled, intermittent or ambiguous, record “Cannot tell”; that fault is outside this model.'
    };
    const showTest = id => {
      selectComponent(TESTS[id].component);
      content.innerHTML=`<h3>${esc(TESTS[id].name)}.</h3><p class="experiment-description">${guidance[id]}</p>${state.events.findLast(e=>e.type==='observation')?.outcome === 'unknown' ? '<div class="result-note warning">No cause eliminated. Improve the observation and repeat, or choose another test.</div>' : ''}${predictions(id,committed)}`;
    };
    showTest(testId);
    if (!committed) {
      mountPlanner({ state, getState, update, actions });
      if (proposal) return;
      const select = document.createElement('select'); select.id='physical-test'; select.setAttribute('aria-label','Choose diagnostic test');
      for (const [id,t] of Object.entries(TESTS)) { const o=document.createElement('option');o.value=id;o.textContent=`${t.name}${id===testId ? ' — rule-based suggestion' : ''}`;select.append(o); } select.value=testId;
      select.onchange=()=>showTest(select.value);
      actions.append(select);
      button('Commit prediction',()=>update(commitPrediction(state,select.value)));
      const b=document.createElement('button');b.className='unclear-button';b.textContent='Inspect equipment with camera';b.onclick=inspect;actions.append(b);
    } else {
      const outcomes = testId === 'bypass' ? '<option value="measured">Use my collected volume</option>' : Object.entries(TESTS[testId].outcomes).map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join('');
      form(`<label for="physical-outcome">Observed result</label><select id="physical-outcome" required><option value="">Choose what you observed</option>${outcomes}<option value="unknown">Cannot tell — keep possibilities open</option></select><div id="physical-specific" hidden>${testId==='bypass' ? measurements(state.criterion.minSeconds) : testId==='valve' ? '<label class="check-label"><input id="physical-state" type="checkbox" required> I confirmed this state using a known indicator or checked calibration.</label>' : ''}</div>${reset('I restored the initial test configuration, including closing the bypass.')}`, 'Record observation', evidence=>{
        let outcome=$('physical-outcome').value;
        if(testId==='bypass' && outcome!=='unknown') { evidence.measurement={volumeMl:$('physical-volume').valueAsNumber,seconds:$('physical-seconds').valueAsNumber};outcome=evidence.measurement.volumeMl>0?'flow':'no_flow'; }
        update(recordObservation(state,outcome,evidence));
      });
      const toggle=()=>{const show=$('physical-outcome').value && $('physical-outcome').value!=='unknown';$('physical-specific').hidden=!show;$('physical-specific').querySelectorAll('input').forEach(i=>i.disabled=!show);};
      $('physical-outcome').onchange=toggle;toggle();
    }
  } else if (['diagnosed','verification_failed'].includes(state.phase)) {
    const cause=HYPOTHESES[state.candidates[0]];selectComponent(cause.component);
    content.innerHTML=`<span class="eyebrow">${state.phase==='verification_failed'?'CHECK FAILED · REASSESS THE REPAIR':'EVIDENCE-SUPPORTED REPAIR'}</span><h3>${esc(cause.repair)}.</h3><p class="experiment-description">${esc(cause.name)} is the remaining supported explanation. Perform this repair on your rig, then record what you did. Isolate pump power before handling tubing or clearing the inlet; keep power connections dry. Restore the test configuration before measuring.</p><div class="result-note warning">${state.phase==='verification_failed'?'The repair has not met the agreed target. Check the action and setup; if the assumptions no longer hold, export this record and start a new investigation.':'The cause remains a hypothesis until the functional check supports recovery.'}</div>`;
    form('', 'Record repair attempted',e=>update(recordRepair(state,e)));
    if(state.phase==='verification_failed') {const b=document.createElement('button');b.className='unclear-button';b.textContent='Review setup in a new case';b.onclick=newCase;actions.append(b);}
  } else if (state.phase==='awaiting_verification') {
    selectComponent('outlet');
    content.innerHTML=`<h3>Measure the result.</h3><p class="experiment-description">With the main flow path ready and bypass closed, collect water in an empty marked cup and time the interval. Enter the collected volume and actual elapsed seconds.</p><div class="prediction-box"><span>AGREED BEFORE TESTING</span><strong>At least ${state.criterion.minRate} mL/s over ${state.criterion.minSeconds} seconds or longer.</strong></div>`;
    form(measurements(0.001)+reset('The bypass was closed throughout this measurement and the main path was ready.'),'Record functional check',e=>update(recordVerification(state,{...e,volumeMl:$('physical-volume').valueAsNumber,seconds:$('physical-seconds').valueAsNumber})));
  } else if(state.phase==='complete') {
    content.innerHTML='<div class="success-symbol">✓</div><h3>Reported check passed.</h3><p class="experiment-description">Your recorded measurement meets the criterion agreed at the start. The cause, repair, observations and measurement are preserved in the evidence record.</p><div class="result-note">Physical measurement reported by the operator. No automated sensor or camera verification is claimed.</div>';
    button('Inspect the evidence',showEvidence);
  } else {
    content.innerHTML='<h3>These results do not fit.</h3><p class="experiment-description">No supported cause explains the recorded observations. Do not apply a suggested repair. Review the evidence, connections and single-fault assumption.</p>';
    button('Review evidence',showEvidence);button('Review setup in a new case',newCase);
  }
}
