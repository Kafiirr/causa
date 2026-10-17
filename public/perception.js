const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const node = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };

export function createPerception({ getCaseId, getFrames, onChange, toast }) {
  let selected = null, configured = false, pending = false, generation = 0, controller;
  let analyses = [], reviews = [];
  const panel = $('perception-panel');
  panel.innerHTML = `<div class="perception-heading"><div><span class="eyebrow">META PERCEPTION / PREVIEW</span><h3>Look. Then check.</h3></div><button id="meta-refresh" class="text-button">Check connection</button></div>
    <p id="meta-connection" role="status">Checking server configuration…</p>
    <p class="perception-note">Capture or load a frame, then explicitly send it to Meta for analysis. Observations need your review. A still image cannot verify flow, pump operation, or a repair.</p>
    <div class="perception-controls"><label class="button light upload-label">Load image<input id="frame-upload" type="file" accept="image/jpeg,image/png" /></label><label>Inspection<select id="perception-task"><option value="scene">Visible components</option><option value="valve">Main valve position</option><option value="bypass">Bypass visibility</option><option value="pump">Pump visibility</option></select></label></div>
    <figure id="frame-preview" hidden><div class="frame-stage"><img id="selected-frame" alt="Selected reference frame"/><svg id="frame-overlay" aria-label="Candidate SAM segmentation overlay" role="img"></svg></div><figcaption id="frame-caption"></figcaption></figure>
    <button id="analyze-frame" class="button primary" disabled>Analyze selected frame ↗</button>
    <p id="perception-status" role="status">Select a frame to begin.</p><div id="perception-result"></div><p id="review-summary" class="perception-note"></p>`;

  function cancel() { generation++; controller?.abort(); if (pending) $('perception-status').textContent = 'Analysis cancelled. No new result was recorded.'; pending = false; updateButton(); }
  function updateButton() { $('analyze-frame').disabled = !configured || !selected || pending || analyses.length >= 24; $('perception-task').disabled = pending; }
  function summary() {
    const certain = reviews.filter(r => r.observation !== 'unclear');
    const agree = certain.filter(r => r.observation === 'matches').length;
    $('review-summary').textContent = `${analyses.length} analyses · ${reviews.length} reviewed · ${agree}/${certain.length} assessable observations marked matching. ${reviews.length - certain.length} unclear excluded. Exploratory operator review; not a calibrated accuracy score.`;
  }
  function latest() { return analyses.findLast(a => a.frame.id === selected?.id && a.task === $('perception-task').value); }
  function showResult() {
    $('perception-result').replaceChildren(); $('frame-overlay').replaceChildren();
    const result = latest(); if (!result) return;
    const section = $('perception-result');
    section.append(node('span', 'MODEL CANDIDATE · DOES NOT UPDATE DIAGNOSIS', 'eyebrow'), node('h4', result.assessment.summary), node('p', `Observed state: ${result.assessment.outcome}. ${result.assessment.reason}`));
    for (const item of result.assessment.components) section.append(node('p', `${item.component}: ${item.observation}`));
    const limits = node('ul');
    for (const text of [...result.assessment.limitations, ...result.limitations]) limits.append(node('li', text));
    section.append(limits);
    const overlay = $('frame-overlay'); overlay.setAttribute('viewBox', `0 0 ${selected.width} ${selected.height}`);
    for (const segmentation of result.segmentations) {
      section.append(node('p', `${segmentation.component} · ${segmentation.status === 'failed' ? 'SAM unavailable; absence not established' : `${segmentation.objects.length} candidate regions`}`, 'segmentation-status'));
      if (segmentation.status !== 'completed') continue;
      for (const object of segmentation.objects) {
        const { x1, y1, x2, y2 } = object.box;
        const group = document.createElementNS(svgNS, 'g');
        const title = document.createElementNS(svgNS, 'title'); title.textContent = `${segmentation.component} ${object.objectId}`; group.append(title);
        const mask = document.createElementNS(svgNS, 'path'); mask.setAttribute('d', object.mask.path);
        mask.setAttribute('transform', `translate(${x1} ${y1}) scale(${(x2-x1+1)/object.mask.width} ${(y2-y1+1)/object.mask.height})`);
        mask.setAttribute('class', 'sam-mask'); group.append(mask);
        const box = document.createElementNS(svgNS, 'rect');
        for (const [key, value] of Object.entries({ x:x1, y:y1, width:x2-x1+1, height:y2-y1+1 })) box.setAttribute(key, value);
        box.setAttribute('class', 'sam-box'); group.append(box); overlay.append(group);
      }
    }
    section.append(node('p', `${result.models.reasoning} + ${result.models.segmentation} · ${(result.elapsedMs / 1000).toFixed(1)} s · frame ${result.frame.sha256.slice(0,12)}`, 'perception-note'));
    const reviewed = reviews.find(r => r.analysisId === result.id);
    if (reviewed) { section.append(node('p', `Review saved: observation ${reviewed.observation}; overlay ${reviewed.segmentation}; reference valve state ${reviewed.referenceOutcome}.`, 'review-saved')); return; }
    const form = node('form', '', 'review-form');
    const select = (label, name, options) => {
      const wrapper = node('label', label); const input = node('select'); input.name = name; input.required = true;
      const placeholder = node('option', 'Choose…'); placeholder.value = ''; input.append(placeholder);
      for (const [value, text] of options) { const option = node('option', text); option.value = value; input.append(option); }
      wrapper.append(input); form.append(wrapper); return input;
    };
    select('Does the observation match the frame?', 'observation', [['matches','Matches'],['incorrect','Incorrect'],['unclear','Cannot tell']]);
    select('Do the regions match the intended components?', 'segmentation', [['matches','Matches'],['incorrect','Incorrect'],['unclear','Cannot tell / no overlay']]);
    const truth = select('Your reference valve state', 'referenceOutcome', [['open','Open'],['closed','Closed'],['unknown','Cannot tell / not applicable']]);
    if (result.task !== 'valve') { truth.value = 'unknown'; truth.disabled = true; }
    const save = node('button', 'Save review', 'button light'); save.type = 'submit'; form.append(save);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (reviews.some(r => r.analysisId === result.id)) return;
      reviews.push({ analysisId: result.id, caseId: result.caseId, frameId: result.frame.id, sha256: result.frame.sha256, task: result.task, at: new Date().toISOString(), observation: form.elements.observation.value, segmentation: form.elements.segmentation.value, referenceOutcome: truth.value, source: 'operator_review' });
      showResult(); summary(); onChange(); toast('Review saved with the exact frame and model result.');
    });
    section.append(form);
  }
  function select(frame) {
    cancel(); selected = frame;
    $('frame-preview').hidden = !frame;
    if (frame) {
      $('selected-frame').src = frame.dataUrl;
      $('frame-caption').textContent = `${frame.source === 'upload' ? 'Loaded image' : 'Camera capture'} · ${frame.width} × ${frame.height} · ${new Date(frame.at).toLocaleTimeString()} · frozen frame`;
      $('perception-status').textContent = 'Only this selected frame is sent when you choose Analyze.';
    }
    document.querySelectorAll('#camera-thumbnails button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.frameId === frame?.id)));
    showResult(); updateButton();
  }
  function addFrame(canvas, source) {
    if (getFrames().length >= 6) { toast('Six frames per case. Export your record and start a new case.'); return; }
    const frame = { id: crypto.randomUUID(), caseId: getCaseId(), type: 'camera_reference', source, at: new Date().toISOString(), width: canvas.width, height: canvas.height, analyzed: false, dataUrl: canvas.toDataURL('image/jpeg', .8) };
    getFrames().push(frame);
    const button = node('button'); button.type = 'button'; button.dataset.frameId = frame.id; button.setAttribute('aria-label', `Select reference capture ${getFrames().length}`);
    const img = node('img'); img.src = frame.dataUrl; img.alt = `Reference capture ${getFrames().length}`; button.append(img); button.addEventListener('click', () => select(frame)); $('camera-thumbnails').append(button);
    select(frame); onChange(); return frame;
  }
  async function connection() {
    $('meta-refresh').disabled = true;
    try {
      const response = await fetch('/api/perception/status', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(); const status = await response.json(); configured = status.configured === true;
      $('meta-connection').textContent = status.message;
    } catch { configured = false; $('meta-connection').textContent = 'Gateway unavailable. You can still capture and export frames.'; }
    finally { $('meta-refresh').disabled = false; updateButton(); }
  }
  $('meta-refresh').addEventListener('click', connection);
  $('perception-task').addEventListener('change', () => { cancel(); showResult(); });
  $('frame-upload').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (!['image/jpeg','image/png'].includes(file.type) || file.size > 5_000_000) { toast('Choose a JPEG or PNG under 5 MB.'); return; }
    const caseId = getCaseId(); let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (caseId !== getCaseId()) return;
      const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); addFrame(canvas, 'upload');
    } catch { toast('This image could not be loaded. Try another JPEG or PNG.'); }
    finally { bitmap?.close(); }
  });
  $('analyze-frame').addEventListener('click', async () => {
    if (!selected || !configured || pending) return;
    cancel(); controller = new AbortController(); const current = generation;
    const frame = selected, caseId = getCaseId(), requestId = crypto.randomUUID(), task = $('perception-task').value;
    pending = true; updateButton(); $('perception-status').textContent = 'Analyzing this frame with Meta…';
    try {
      const bytes = Uint8Array.from(atob(frame.dataUrl.split(',')[1]), c => c.charCodeAt(0));
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2,'0')).join('');
      if (current !== generation) return;
      const response = await fetch('/api/perception/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70_000)]), body: JSON.stringify({ caseId, requestId, frameId:frame.id, capturedAt:frame.at, source:frame.source, width:frame.width, height:frame.height, image:frame.dataUrl, task }) });
      const result = await response.json(); if (current !== generation || caseId !== getCaseId()) return;
      if (!response.ok) throw new Error(result.error?.message || 'Analysis could not complete.');
      if (result.schema !== 'causa.perception.v1' || result.caseId !== caseId || result.requestId !== requestId || result.frame?.id !== frame.id || result.frame.sha256 !== hash || result.task !== task || result.frame.width !== frame.width || result.frame.height !== frame.height) throw new Error('The response did not match this capture. No result was accepted.');
      analyses.push(result); frame.analyzed = true; showResult(); summary(); onChange();
      $('perception-status').textContent = 'Candidate ready for review. The simulated diagnosis is unchanged.';
    } catch (error) { if (current === generation) $('perception-status').textContent = error.name === 'TimeoutError' ? 'Analysis timed out. Try again.' : error.message || 'Analysis failed. Try again.'; }
    finally { if (current === generation) { pending = false; updateButton(); } }
  });
  connection(); summary();
  return { addFrame, cancel, reset() { cancel(); selected = null; analyses = []; reviews = []; $('frame-preview').hidden = true; $('selected-frame').removeAttribute('src'); $('frame-overlay').replaceChildren(); $('perception-result').replaceChildren(); $('perception-status').textContent = 'Select a frame to begin.'; summary(); updateButton(); }, export() { return { schema:'causa.validation.v1', analyses, reviews, liveModelAccuracy:'not_established', diagnosticEffect:'none' }; }, describe(frame) { const results = analyses.filter(a => a.frame.id === frame.id); return results.length ? `${results.length} model candidates · ${reviews.filter(r => r.frameId === frame.id).length} operator reviews · diagnosis unchanged` : 'Reference only; not model analyzed.'; } };
}
