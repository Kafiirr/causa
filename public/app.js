import { frameSize } from './frame-preparation.js';
import { HYPOTHESES, TESTS, createInvestigation, nextTest, commitPrediction, recordObservation, recordRepair, recordVerification, evidenceExport } from './engine.js';
import { createPerception } from './perception.js';
import { SimulatedRig, randomFault } from './rig.js';

const $ = id => document.getElementById(id);
let state = createInvestigation();
let rig = new SimulatedRig(randomFault());
let attachments = [];
let stream = null;
let cameraGeneration = 0;
let toastTimer;
let operation = 0;
let busy = false;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const components = {
  reservoir: ['01 / Reservoir', 'Supplies both branches through the pump. An inlet obstruction can affect the entire system.'],
  pump: ['02 / Pump', 'Provides the shared water supply. Checking operation separates a power fault from an inlet obstruction.'],
  valve: ['03 / Main valve', 'Controls the main branch. Its position is an observation to inspect, not infer from this schematic.'],
  tube: ['Main branch / Tubing', 'A restriction here interrupts the main route while leaving the bypass available.'],
  bypass: ['04 / Bypass', 'An independent route around the main branch. Temporarily opening it helps localize the fault.'],
  outlet: ['05 / Collection cup', 'The final functional check measures collected volume over time after the bypass has been closed.']
};

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== `page-${name}`; });
  document.querySelectorAll('nav [data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === name);
    if (el.dataset.page === name) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  if (name !== 'lab') { stopCamera(); perception.cancel(); }
  if (name === 'evidence') renderEvidence();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => showPage(el.dataset.page)));

function selectComponent(id) {
  document.querySelectorAll('.component').forEach(el => el.classList.toggle('selected', el.dataset.component === id));
  if (components[id]) {
    $('component-name').textContent = components[id][0];
    $('component-description').textContent = components[id][1];
  }
}
document.querySelectorAll('.component').forEach(el => {
  el.addEventListener('click', () => selectComponent(el.dataset.component));
  el.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); selectComponent(el.dataset.component); } });
});
$('layout-select').addEventListener('change', e => {
  $('rig-svg').classList.toggle('rig-reversed', e.target.value === 'b');
  $('scene-layout-label').textContent = e.target.value === 'b' ? 'LAYOUT B' : 'LAYOUT A';
  toast('Layout changed. The reviewed connections stay the same.');
});

function predictionsMarkup(testId, committed) {
  const test = TESTS[testId];
  const candidates = committed ? Object.keys(state.pending.predictions) : state.candidates;
  const groups = {};
  for (const id of candidates) (groups[test.predictions[id]] ||= []).push(HYPOTHESES[id].name.toLowerCase());
  return `<div class="prediction-box ${committed ? 'committed' : ''}"><span>${committed ? '⌑ PREDICTIONS COMMITTED' : '↳ PREDICT BEFORE YOU ACT'}</span>${Object.entries(groups).map(([outcome, causes]) => `<div class="prediction-row"><b>↳</b><div><strong>${escapeHTML(test.outcomes[outcome])}</strong><br>${escapeHTML(causes.join(' or '))} remains possible.</div></div>`).join('')}</div>`;
}

function action(label, fn, secondary) {
  const button = document.createElement('button');
  button.className = secondary ? 'unclear-button' : 'button primary';
  button.textContent = label;
  if (!secondary) { const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); button.appendChild(arrow); }
  button.disabled = busy;
  button.addEventListener('click', async () => { try { await fn(); } catch (error) { toast(error.message || 'This action could not be completed.'); } });
  $('experiment-actions').appendChild(button);
}

function setFlow(path, flowing) {
  $('water-main').classList.toggle('flowing', flowing && path === 'main');
  $('water-bypass').classList.toggle('flowing', flowing && path === 'bypass');
  $('flow-status').innerHTML = `<span class="status-dot ${flowing ? 'flow-dot' : 'fault-dot'}"></span> ${flowing ? path === 'bypass' ? 'Bypass flow observed' : 'Outlet flow restored' : 'No outlet flow'}`;
  $('cup-water').setAttribute('y', flowing ? '246' : '288');
  $('cup-water').setAttribute('height', flowing ? '45' : '3');
}

function render() {
  const observations = state.events.filter(e => e.type === 'observation');
  const successfulObservations = observations.filter(e => e.outcome !== 'unknown');
  const isolated = state.candidates.length === 1;
  const complete = state.phase === 'complete';
  $('evidence-count').textContent = String(state.events.length + attachments.length);
  $('metric-causes').textContent = String(state.candidates.length).padStart(2, '0');
  $('metric-tests').textContent = String(observations.length).padStart(2, '0');
  $('metric-check').innerHTML = `${complete ? 'Passed' : state.phase === 'verification_failed' ? 'Failed' : 'Pending'}<span>${complete ? '✓' : '↗'}</span>`;
  $('metric-check').classList.toggle('verified', complete);
  $('metric-check-caption').textContent = complete ? '120 mL / 10 s · simulated' : 'evidence before completion';
  $('hypothesis-count').textContent = isolated ? '1 supported' : `${state.candidates.length} possible`;
  $('experiment-number').textContent = String(observations.length + 1).padStart(2, '0');
  $('stage-observe').className = successfulObservations.length ? 'finished' : 'current';
  $('stage-isolate').className = isolated ? 'finished' : successfulObservations.length ? 'current' : '';
  $('stage-verify').className = complete ? 'finished' : isolated ? 'current' : '';
  $('hypotheses').innerHTML = Object.entries(HYPOTHESES).map(([id, h], i) => {
    const possible = state.candidates.includes(id);
    return `<div class="hypothesis ${possible ? isolated ? 'supported' : '' : 'eliminated'}"><span class="hypothesis-indicator">${possible ? isolated ? '✓' : i + 1 : '×'}</span><span class="hypothesis-name">${escapeHTML(h.name)}</span><span class="hypothesis-status">${possible ? isolated ? 'SUPPORTED' : 'POSSIBLE' : 'RULED OUT'}</span></div>`;
  }).join('');
  $('experiment-actions').replaceChildren();
  const lastObservation = observations.at(-1);
  if (state.phase === 'investigating' || state.phase === 'awaiting_observation') {
    const committed = state.phase === 'awaiting_observation';
    const testId = committed ? state.pending.testId : nextTest(state);
    if (!testId) { $('experiment-content').innerHTML = '<h3>More evidence needed.</h3><p class="experiment-description">The supported tests cannot distinguish the remaining explanations. Start a new case to review the assumptions.</p>'; action('Start a new case', () => $('case-dialog').showModal()); return; }
    const test = TESTS[testId];
    selectComponent(test.component);
    const unknownNote = lastObservation?.outcome === 'unknown' ? '<div class="result-note warning">Observation unclear. No causes were eliminated. Repeat the test with a better view.</div>' : '';
    $('experiment-content').innerHTML = `<h3>${escapeHTML(test.name)}.</h3><p class="experiment-description">${escapeHTML(test.instruction)}</p>${unknownNote}${predictionsMarkup(testId, committed)}`;
    if (committed) {
      action('Run simulated test', async () => {
        const currentOperation = operation;
        busy = true; render();
        $('experiment-actions').querySelector('button').firstChild.textContent = 'Observing the simulated rig… ';
        const outcome = rig.runTest(testId);
        if (testId === 'bypass') setFlow('bypass', outcome === 'flow');
        await sleep(900);
        if (operation !== currentOperation) return;
        state = recordObservation(state, outcome);
        setFlow('main', false);
        busy = false; render();
        toast(TESTS[testId].outcomes[outcome]);
      });
      action('Mark observation as unclear', () => { state = recordObservation(state, 'unknown'); render(); toast('Evidence unresolved. All current hypotheses retained.'); }, true);
    } else action('Commit prediction', () => { state = commitPrediction(state, testId); render(); });
  } else if (state.phase === 'diagnosed' || state.phase === 'verification_failed') {
    const id = state.candidates[0];
    const h = HYPOTHESES[id];
    selectComponent(h.component);
    const failed = state.phase === 'verification_failed';
    $('experiment-content').innerHTML = `<div class="success-symbol">⌖</div><h3>${escapeHTML(h.name)}.</h3><p class="experiment-description">${escapeHTML(h.detail)} This is the remaining explanation within the four supported causes.</p><div class="result-note ${failed ? 'warning' : ''}">${failed ? 'The functional check failed. The investigation remains open. Review the repair and test again.' : 'The fault is isolated. Operation has not been verified yet.'}</div><div class="prediction-box"><span>REPAIR TO ATTEMPT</span><div class="prediction-row"><b>↳</b><div><strong>${escapeHTML(h.repair)}.</strong><br>Close the bypass before measuring main-branch output.</div></div></div>`;
    action('Apply simulated repair', () => { rig.repair(id); state = recordRepair(state); setFlow('main', rig.measure().volumeMl > 0); render(); });
  } else if (state.phase === 'awaiting_verification') {
    selectComponent('outlet');
    $('experiment-content').innerHTML = '<h3>Check what changed.</h3><p class="experiment-description">The repair has been attempted. Measure main-branch output with the bypass closed before closing the investigation.</p><div class="prediction-box"><span>FUNCTIONAL CHECK</span><div class="prediction-row"><b>↳</b><div><strong>At least 100 mL in 10 seconds.</strong><br>The simulator advances a 10-second measurement interval. This is not a real sensor reading.</div></div></div>';
    action('Run simulated flow check', async () => {
      const currentOperation = operation;
      busy = true; render();
      $('experiment-actions').querySelector('button').firstChild.textContent = 'Evaluating simulated output… ';
      await sleep(1100);
      if (operation !== currentOperation) return;
      state = recordVerification(state, rig.measure(10));
      busy = false; render();
      toast(state.phase === 'complete' ? 'Functional check passed in simulation.' : 'Functional check failed. Case remains open.');
    });
  } else if (complete) {
    const verification = state.events.findLast(e => e.type === 'verification');
    $('experiment-content').innerHTML = `<div class="success-symbol">✓</div><h3>Operation restored.</h3><p class="experiment-description">The simulated rig passed its functional check. Every decision is linked to a prediction and observation in the evidence record.</p><div class="verification-readout"><div><strong>${verification.volumeMl} mL</strong><span>COLLECTED IN ${verification.seconds} SECONDS</span></div><div><strong>12 mL/s</strong><span>10 mL/s REQUIRED</span></div></div><div class="result-note">Verified in simulation. Physical validation is the next step.</div>`;
    action('Inspect the evidence', () => showPage('evidence'));
    action('Start another investigation', () => $('case-dialog').showModal(), true);
    setFlow('main', true);
  } else {
    $('experiment-content').innerHTML = '<h3>The evidence conflicts.</h3><p class="experiment-description">No supported hypothesis explains these observations. Review the setup and the single-fault assumption. This case cannot be marked complete.</p><div class="result-note warning">Unresolved evidence requires a new investigation.</div>';
    action('Review evidence', () => showPage('evidence'));
  }
  $('latest-evidence').textContent = describeEvent(state.events.at(-1)).summary;
  if (!$('page-evidence').hidden) renderEvidence();
}

function describeEvent(e) {
  if (e.type === 'started') return { title: 'Investigation opened', summary: e.observation, details: e.assumptions };
  if (e.type === 'prediction_committed') return { title: `Prediction committed: ${TESTS[e.testId].name.toLowerCase()}`, summary: 'Expected outcomes recorded before the observation.', details: Object.entries(e.predictions).map(([id, outcome]) => `${HYPOTHESES[id].name} → ${TESTS[e.testId].outcomes[outcome]}`) };
  if (e.type === 'observation') return { title: e.outcome === 'unknown' ? 'Observation unresolved' : TESTS[e.testId].outcomes[e.outcome], summary: e.outcome === 'unknown' ? 'No hypothesis eliminated. Repeat the observation.' : `${e.remainingCandidates.length} supported ${e.remainingCandidates.length === 1 ? 'possibility' : 'possibilities'}. Source: simulated rig. Test configuration reset afterward.` };
  if (e.type === 'repair_attempted') return { title: e.instruction, summary: 'Repair applied in simulation. Functional verification still required.' };
  if (e.type === 'verification') return { title: e.passed ? 'Functional check passed' : 'Functional check failed', summary: `${e.volumeMl} mL collected over ${e.seconds} seconds in simulation. ${e.criterion}` };
  return { title: 'Event recorded', summary: '' };
}

function renderEvidence() {
  $('evidence-list').innerHTML = state.events.map(e => {
    const description = describeEvent(e);
    return `<article class="evidence-entry"><span class="event-number">${String(e.sequence).padStart(2, '0')}</span><div><span class="event-type">${e.type.replaceAll('_', ' ').toUpperCase()}</span><h3>${escapeHTML(description.title)}</h3><p>${escapeHTML(description.summary)}</p>${description.details ? `<ul>${description.details.map(d => `<li>${escapeHTML(d)}</li>`).join('')}</ul>` : ''}</div><time datetime="${e.at}">${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></article>`;
  }).join('');
  $('attachment-list').replaceChildren();
  for (const [index, attachment] of attachments.entries()) {
    const figure = document.createElement('figure');
    const img = document.createElement('img'); img.src = attachment.dataUrl; img.alt = `Reference camera capture ${index + 1}`;
    const caption = document.createElement('figcaption'); caption.textContent = `Capture ${index + 1} · ${new Date(attachment.at).toLocaleTimeString()} · ${perception.describe(attachment)}`;
    figure.append(img, caption); $('attachment-list').appendChild(figure);
  }
}

$('export-evidence').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ ...evidenceExport(state, attachments), perception: perception.export() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `causa-${state.id.slice(0, 8)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Evidence record exported. Camera captures are included if present.');
});

$('new-case').addEventListener('click', () => $('case-dialog').showModal());
$('close-dialog').addEventListener('click', () => $('case-dialog').close());
$('case-dialog').addEventListener('click', e => { if (e.target === $('case-dialog')) { const bounds = $('case-dialog').getBoundingClientRect(); if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) $('case-dialog').close(); } });
$('case-form').addEventListener('submit', e => {
  e.preventDefault();
  operation += 1; busy = false; stopCamera();
  state = createInvestigation(); rig = new SimulatedRig($('fault-select').value === 'random' ? randomFault() : $('fault-select').value);
  attachments = []; perception.reset(); $('camera-thumbnails').replaceChildren();
  $('case-dialog').close(); setFlow('main', false); showPage('lab'); setView('rig'); render();
  toast('New investigation started. The fault is hidden from the planner.');
});

function setView(view) {
  const camera = view === 'camera';
  document.querySelector('.component-detail').hidden = camera;
  $('digital-view').hidden = camera; $('camera-view').hidden = !camera;
  $('view-camera').classList.toggle('selected', camera); $('view-rig').classList.toggle('selected', !camera);
  $('view-camera').setAttribute('aria-pressed', String(camera)); $('view-rig').setAttribute('aria-pressed', String(!camera));
  $('feed-label').textContent = camera ? 'REFERENCE CAPTURE' : 'SIMULATED FEED';
  if (!camera) { stopCamera(); perception.cancel(); }
}
$('view-rig').addEventListener('click', () => setView('rig'));
$('view-camera').addEventListener('click', () => setView('camera'));

function stopCamera() {
  cameraGeneration += 1;
  if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
  $('camera-video').srcObject = null; $('camera-video').hidden = true; $('camera-placeholder').hidden = false;
  $('camera-capture').disabled = true; $('camera-stop').hidden = true; $('camera-enable').hidden = false; $('camera-enable').disabled = false;
  $('camera-status').textContent = 'Capture a frame to inspect and review.';
}

$('camera-enable').addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) { $('camera-status').textContent = 'Camera capture requires HTTPS or localhost in a supported browser.'; return; }
  const generation = ++cameraGeneration;
  $('camera-enable').disabled = true;
  $('camera-status').textContent = 'Waiting for camera permission…';
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } });
    if (generation !== cameraGeneration) { newStream.getTracks().forEach(track => track.stop()); return; }
    stream = newStream; $('camera-video').srcObject = stream;
    await $('camera-video').play();
    if (generation !== cameraGeneration) return;
    $('camera-video').hidden = false; $('camera-placeholder').hidden = true; $('camera-enable').hidden = true; $('camera-stop').hidden = false;
    $('camera-capture').disabled = attachments.length >= 6;
    $('camera-status').textContent = 'Camera active. Up to 6 frames per case. Analysis sends only your selected capture.';
  } catch (error) {
    if (generation !== cameraGeneration) return;
    stopCamera();
    $('camera-status').textContent = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser to try again.' : 'Could not open a camera. Check that a camera is connected and available.';
  } finally { if (generation === cameraGeneration) $('camera-enable').disabled = false; }
});
$('camera-stop').addEventListener('click', stopCamera);
$('camera-capture').addEventListener('click', () => {
  const video = $('camera-video');
  if (!stream || !video.videoWidth || attachments.length >= 6) return;
  const canvas = document.createElement('canvas');
  const size=frameSize(video.videoWidth,video.videoHeight);
  canvas.width=size.width;canvas.height=size.height;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  try { perception.addFrame(canvas, 'camera'); } catch(error) { toast(error.message); return; }
  $('camera-capture').disabled = attachments.length >= 6;
  $('camera-status').textContent = `${attachments.length} of 6 reference frames captured. These are not diagnostic observations.`;
  $('evidence-count').textContent = String(state.events.length + attachments.length);
  toast('Reference frame captured. Export it from Evidence.');
});
const perception = createPerception({ getCaseId: () => state.id, getFrames: () => attachments, onChange: () => { $('evidence-count').textContent = String(state.events.length + attachments.length); $('camera-capture').disabled = !stream || attachments.length >= 6; }, toast });
window.addEventListener('pagehide', () => { stopCamera(); perception.cancel(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopCamera(); perception.cancel(); } });
render();
