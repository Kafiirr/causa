import { COMPONENTS, LABELS, TARGETS, regionKey, validRegion, taskForComponent, conflictingClaims } from './perception-contract.js';
const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const node = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };

export function createPerception({ getCaseId, getFrames, onChange, toast }) {
  let selected = null, configured = false, pending = false, generation = 0, controller;
  let analyses = [], reviews = [];
  let focus = null, selecting = false, drag = null;
  const panel = $('perception-panel');
  panel.innerHTML = `<div class="perception-heading"><div><span class="eyebrow">META PERCEPTION / PREVIEW</span><h3>Look. Then check.</h3></div><button id="meta-refresh" class="text-button">Check connection</button></div>
    <p id="meta-connection" role="status">Checking server configuration…</p>
    <p class="perception-note">Capture or load a frame, then explicitly send it to Meta for analysis. Observations need your review. A still image cannot verify flow, pump operation, or a repair.</p>
    <div class="perception-controls"><label class="button light upload-label">Load image<input id="frame-upload" type="file" accept="image/jpeg,image/png" /></label><label>Inspection<select id="perception-task"><option value="scene">All visible components</option><option value="reservoir">Reservoir visibility</option><option value="outlet">Outlet visibility</option><option value="tube">Tubing visibility</option><option value="valve">Main valve appearance</option><option value="bypass">Bypass visibility</option><option value="pump">Pump visibility</option></select></label></div>
    <figure id="frame-preview" hidden><p id="mark-instruction" hidden>Manual crop: drag a box on the image. This is your selection, not an AI detection.</p><div class="frame-stage"><img draggable="false" id="selected-frame" alt="Selected reference frame"/><svg id="frame-overlay" aria-label="Image regions and manual crop" role="img"></svg></div><figcaption id="frame-caption"></figcaption></figure>
    <div id="region-controls" class="region-controls" hidden>
      <label>Analysis target<select id="region-component"></select></label>
      <div class="region-actions"><button id="region-mark" class="button light" aria-pressed="false">Mark component region</button><button id="region-clear" class="text-button">Use full frame</button></div>
      <p id="region-status" role="status">Full frame. Mark the intended component if localization is missing or ambiguous.</p>
      <details><summary>Set region coordinates</summary><div class="region-numbers"><label>Left<input id="region-x" type="number" min="0" step="1" value="0"></label><label>Top<input id="region-y" type="number" min="0" step="1" value="0"></label><label>Width<input id="region-width" type="number" min="16" step="1" value="16"></label><label>Height<input id="region-height" type="number" min="16" step="1" value="16"></label></div><button id="region-apply" class="button light">Apply region</button></details>
      <p class="perception-note">Drag a box around one component, including useful labels. A selected region narrows the search; it does not verify identity. Analysis sends the full frame and crop to Meta.</p>
    </div>
    <p id="analysis-scope" class="perception-note"></p><button id="analyze-frame" class="button primary" disabled>Analyze selected frame ↗</button>
    <p id="perception-status" role="status">Select a frame to begin.</p><div id="perception-result"></div><div id="review-summary" class="perception-note"></div>`;

  function cancel() { generation++; controller?.abort(); if (pending) $('perception-status').textContent = 'Analysis cancelled. No new result was recorded.'; pending = false; updateButton(); }
  function updateButton() {
    $('analyze-frame').disabled = !configured || !selected || pending || selecting || analyses.length >= 24;
    $('perception-task').disabled = pending;
    $('region-component').disabled = pending;
    for (const id of ['region-mark','region-clear','region-apply']) $(id).disabled = pending || !selected;
    $('region-mark').disabled ||= !TARGETS[$('perception-task').value];
    $('region-apply').disabled ||= !TARGETS[$('perception-task').value];
  }
  function summary() {
    const root = $('review-summary'); root.replaceChildren();
    root.append(node('p', `${analyses.length} analyses across ${new Set(analyses.map(a => a.frame.sha256)).size} distinct images · ${reviews.length} reviewed. Repeated inspections of one image are not independent samples.`));
    for (const component of Object.keys(COMPONENTS)) {
      const entries = reviews.flatMap(r => r.components).filter(c => c.component === component);
      if (!entries.length) continue;
      const claims = entries.filter(c => c.observation !== 'unclear');
      const groundings=entries.filter(c=>['matches','incorrect'].includes(c.grounding));
      const masks = entries.filter(c => ['matches','incorrect','missed'].includes(c.segmentation));
      root.append(node('p', `${LABELS[component]}: ${claims.filter(c => c.observation === 'matches').length}/${claims.length} assessable descriptions matching · ${masks.filter(c => c.segmentation === 'matches').length}/${masks.length} assessable SAM localizations matching · ${masks.filter(c => c.segmentation === 'missed').length} missed · ${groundings.filter(c=>c.grounding==='matches').length}/${groundings.length} assessable Muse boxes matching. ${entries.length - claims.length} unclear descriptions excluded.`));
    }
    root.append(node('p', 'Exploratory operator review, not calibrated accuracy. Unclear or unassessed regions are excluded from localization counts.'));
  }
  function latest() { return analyses.findLast(a => a.frame.id === selected?.id && a.task === $('perception-task').value && regionKey(a.focus) === regionKey(focus)); }
  function renderFocus(region = focus) {
    $('frame-overlay').querySelector('.manual-region')?.remove();
    if (!region) return;
    const rect = document.createElementNS(svgNS, 'rect');
    for (const [key,value] of Object.entries({x:region.x,y:region.y,width:region.width,height:region.height})) rect.setAttribute(key,value);
    rect.setAttribute('class','manual-region'); $('frame-overlay').append(rect);
  }
  function regionUI() {
    $('region-controls').hidden = !selected;
    $('region-mark').setAttribute('aria-pressed',String(selecting));
    $('mark-instruction').hidden=!selecting;
    const target=TARGETS[$('perception-task').value];
    $('analysis-scope').textContent = `${target ? LABELS[target] : 'All six components'} · ${focus ? 'manual crop + full-frame context' : 'automatic full-frame inspection'} · up to ${target ? 2 : 6} model calls. Changing controls does not call Meta. Dashed = Muse proposal; filled = SAM mask; white = your crop.`;
    $('region-mark').textContent = selecting ? 'Cancel marking' : 'Mark component region';
    $('frame-overlay').classList.toggle('selecting-region',selecting);
    if (selected) $('frame-overlay').setAttribute('viewBox',`0 0 ${selected.width} ${selected.height}`);
    $('region-status').textContent = selecting ? 'Drag over the image to mark one component. Or set exact coordinates below.' : focus ? `${LABELS[focus.component]} · operator-selected region · ${focus.width} × ${focus.height} at (${focus.x}, ${focus.y}). Identity unverified.` : `Full-frame analysis target: ${target ? LABELS[target] : 'all components'}. ${target ? 'Manual cropping is optional.' : 'Choose a specific target to draw a crop.'}`;
    for (const key of ['x','y','width','height']) $(`region-${key}`).value = focus?.[key] ?? (key === 'width' ? selected?.width || 16 : key === 'height' ? selected?.height || 16 : 0);
    renderFocus(); updateButton();
  }
  function setRegion(region) {
    if (region && !validRegion(region,selected,$('perception-task').value)) { toast('Choose a region at least 16 × 16 pixels inside the frame.'); return false; }
    cancel(); focus = region; selecting = false; drag = null; showResult(); regionUI();
    $('perception-status').textContent = 'Region changed. Analyze explicitly to inspect this selection; earlier results remain in the export.';
    return true;
  }
  function drawBox(bounds,caption,component,className) {
    const group=document.createElementNS(svgNS,'g');group.dataset.component=component||'unresolved';group.style.setProperty('--region-color',className==='muse-box'?'#44b7e3':'#aaa');
    const box=document.createElementNS(svgNS,'rect');
    for(const [key,value] of Object.entries({x:bounds.x1,y:bounds.y1,width:bounds.x2-bounds.x1+1,height:bounds.y2-bounds.y1+1}))box.setAttribute(key,value);
    box.setAttribute('class',className);group.append(box);
    const text=document.createElementNS(svgNS,'text');text.setAttribute('x',bounds.x1+3);text.setAttribute('y',Math.max(14,bounds.y1-5));text.setAttribute('class','sam-label');if(bounds.x1>selected.width*.65){text.setAttribute('text-anchor','end');text.setAttribute('x',Math.min(selected.width-4,bounds.x2));}text.textContent=caption;group.append(text);
    $('frame-overlay').append(group);return group;
  }
  function showResult() {
    $('perception-result').replaceChildren(); $('frame-overlay').replaceChildren(); renderFocus();
    const result = latest(); if (!result || selecting) return;
    const section = $('perception-result');
    section.append(node('span', 'MODEL CANDIDATE · DOES NOT UPDATE DIAGNOSIS', 'eyebrow'), node('h4', result.assessment.summary));
    section.append(node('p', 'Physical valve state: unknown · Pump operation: unknown · Flow: unknown', 'physical-claims'), node('p', result.assessment.reason));
    const componentIds = result.target ? [result.target] : Object.keys(COMPONENTS);
    const overlay = $('frame-overlay'); overlay.setAttribute('viewBox', `0 0 ${selected.width} ${selected.height}`);
    const colors = {reservoir:'#e5b144',pump:'#72c9ed',main_valve:'#ef945d',bypass_valve:'#cbb4fa',tube:'#80d1b7',outlet:'#f0a2c7'};
    for (const component of componentIds) {
      const claim = result.assessment.components.find(c => c.component === component);
      const segmentation = result.segmentations.find(c => c.component === component);
      const card = node('article','','component-observation'); card.dataset.component = component;
      card.append(node('h4',LABELS[component]));
      card.append(node('p',`Visibility: ${(claim?.visibility || 'unknown').replaceAll('_',' ')}. ${claim?.observation || 'Muse did not provide a description for this target.'}`));
      if (component.endsWith('_valve')) card.append(node('p',`Handle type: ${(claim?.handleType || 'unknown').replaceAll('_',' ')} · direction: ${claim?.orientation || 'unknown'}. T-shaped/round handles do not provide a reliable lever direction. Physical state remains unknown.`));
      const conflicts=conflictingClaims(analyses,result,component);
      if(conflicts.length)card.append(node('p',`Repeated analyses disagree on ${conflicts.join(' and ')} for this exact image and scope. Treat this claim as unresolved.`, 'claim-conflict'));
      const regionText = !segmentation ? 'Not requested for this component.' : segmentation.status === 'failed' ? 'Unavailable. Absence has not been established.' : segmentation.objects.length ? `${segmentation.objects.length} SAM mask(s) associated with a Muse location proposal. Identity and full-component coverage need review.` : segmentation.rawMatches ? `SAM found ${segmentation.rawMatches} concept match(es), but none could be assigned to this component. Role unresolved.` : 'No matching region found by SAM. This does not establish that the component is absent.';
      card.append(node('p',`SAM localization: ${regionText}`,'segmentation-status'));
      if(claim?.grounding){
        card.append(node('p',`Muse location: approximate box proposal. ${claim.grounding.evidence} This is independent of SAM success.`));
        const boxGroup=drawBox(claim.grounding.box,`${LABELS[component]} · Muse proposal`,component,'muse-box');
        const label=node('label','','overlay-toggle');const toggle=node('input');toggle.type='checkbox';toggle.checked=!segmentation?.objects.length;
        boxGroup.style.display=toggle.checked?'':'none';label.append(toggle,document.createTextNode(`Show approximate ${LABELS[component].toLowerCase()} Muse box`));card.append(label);
        toggle.addEventListener('change',()=>boxGroup.style.display=toggle.checked?'':'none');
      } else card.append(node('p','Muse location: unavailable or ambiguous. No component box is asserted.'));
      if (!segmentation?.objects.length) {
        const mark = node('button',`Mark ${LABELS[component].toLowerCase()} region`,'text-button');
        mark.addEventListener('click',()=>{ changeTask(taskForComponent(component)); startMarking(); });
        card.append(mark);
      }
      if (segmentation?.objects.length) {
        const label=node('label','','overlay-toggle');const toggle=node('input');toggle.type='checkbox';toggle.checked=true;label.append(toggle,document.createTextNode(`Show associated ${LABELS[component].toLowerCase()} SAM candidates`));card.append(label);
        const groups=[];
        for (const object of segmentation.objects) {
          const {x1,y1,x2,y2}=object.box; const group=document.createElementNS(svgNS,'g'); group.dataset.component=component; group.style.setProperty('--region-color',colors[component]);
          const title=document.createElementNS(svgNS,'title');title.textContent=`${LABELS[component]} candidate ${object.objectId} — identity unverified`;group.append(title);
          const mask=document.createElementNS(svgNS,'path');mask.setAttribute('d',object.mask.path);mask.setAttribute('transform',`translate(${x1} ${y1}) scale(${(x2-x1+1)/object.mask.width} ${(y2-y1+1)/object.mask.height})`);mask.setAttribute('class','sam-mask');group.append(mask);
          const box=document.createElementNS(svgNS,'rect');for(const [key,value] of Object.entries({x:x1,y:y1,width:x2-x1+1,height:y2-y1+1}))box.setAttribute(key,value);box.setAttribute('class','sam-box');group.append(box);
          const caption=document.createElementNS(svgNS,'text');caption.setAttribute('x',x1+3);caption.setAttribute('y',Math.max(14,y1-5));caption.setAttribute('class','sam-label');if(x1>selected.width*.65){caption.setAttribute('text-anchor','end');caption.setAttribute('x',Math.min(selected.width-4,x2));}caption.textContent=`${LABELS[component]} · candidate`;group.append(caption);
          overlay.append(group);groups.push(group);
        }
        toggle.addEventListener('change',()=>groups.forEach(g=>g.style.display=toggle.checked?'':'none'));
      }
      section.append(card);
    }
    if(result.unresolvedRegions?.length){
      const label=node('label','','overlay-toggle');const toggle=node('input');toggle.type='checkbox';
      label.append(toggle,document.createTextNode(`Show ${result.unresolvedRegions.length} unassigned SAM candidate(s) — roles unresolved`));section.append(label);
      const groups=result.unresolvedRegions.map(object=>drawBox(object.box,`${object.prompt} · unresolved`,null,'unresolved-box'));
      groups.forEach(g=>g.style.display='none');toggle.addEventListener('change',()=>groups.forEach(g=>g.style.display=toggle.checked?'':'none'));
    }
    renderFocus();
    const limits=node('ul'); for(const text of [...result.assessment.limitations,...result.limitations])limits.append(node('li',text));section.append(limits);
    section.append(node('p',`${result.models.reasoning} + ${result.models.segmentation} · ${(result.elapsedMs/1000).toFixed(1)} s · frame ${result.frame.sha256.slice(0,12)}${result.focus ? ` · crop ${result.focus.sha256.slice(0,12)}` : ''}`,'perception-note'));
    const reviewed=reviews.find(r=>r.analysisId===result.id);
    if(reviewed){section.append(node('p',`Review saved for ${reviewed.components.length} component(s). Reference valve state: ${reviewed.referenceOutcome}.`,'review-saved'));return;}
    const form=node('form','','review-form');
    function choice(parent,label,name,options){const wrapper=node('label',label);const input=node('select');input.name=name;input.required=true;const blank=node('option','Choose…');blank.value='';input.append(blank);for(const [value,text] of options){const option=node('option',text);option.value=value;input.append(option);}wrapper.append(input);parent.append(wrapper);return input;}
    for(const component of componentIds){
      const group=node('fieldset');group.append(node('legend',`${LABELS[component]} review`));
      choice(group,'Does this component description match?',`observation_${component}`,[['matches','Matches'],['incorrect','Incorrect'],['unclear','Cannot tell']]);
      const segmentation=result.segmentations.find(s=>s.component===component);
      if(result.assessment.components.find(c=>c.component===component)?.grounding)choice(group,'Does the approximate Muse box cover the intended component?',`grounding_${component}`,[['matches','Matches'],['incorrect','Wrong / incomplete box'],['unclear','Cannot tell']]);
      if(segmentation?.status==='completed')choice(group,'Does the SAM mask cover this component?',`segmentation_${component}`,[...(segmentation.objects.length ? [['matches','Matches intended component'],['incorrect','Wrong region / incomplete coverage']] : []),['missed','Visible component was missed'],['unclear','Cannot tell']]);
      else group.append(node('p',segmentation ? 'Regions unavailable; localization will be recorded as unassessed.' : 'Segmentation not requested; localization will be recorded as unassessed.','perception-note'));
      form.append(group);
    }
    const truth=choice(form,'Your independently known reference valve state','referenceOutcome',[['open','Open — independently known'],['closed','Closed — independently known'],['unknown','Cannot tell / not applicable']]);
    if(!['valve','bypass'].includes(result.task)){truth.value='unknown';truth.disabled=true;}
    const save=node('button','Save review','button light');save.type='submit';form.append(save);
    form.addEventListener('submit',event=>{
      event.preventDefault();if(reviews.some(r=>r.analysisId===result.id))return;
      reviews.push({analysisId:result.id,caseId:result.caseId,frameId:result.frame.id,sha256:result.frame.sha256,focus:result.focus,task:result.task,at:new Date().toISOString(),components:componentIds.map(component=>({component,observation:form.elements[`observation_${component}`].value,segmentation:form.elements[`segmentation_${component}`]?.value || 'unassessed',grounding:form.elements[`grounding_${component}`]?.value || 'unassessed'})),referenceOutcome:truth.value,source:'operator_review'});
      showResult();summary();onChange();toast('Component reviews saved with this frame and region.');
    });
    section.append(form);
  }
  function select(frame) {
    cancel(); selected = frame; focus = null; selecting = false; drag = null;
    $('frame-preview').hidden = !frame;
    if (frame) {
      $('selected-frame').src = frame.dataUrl;
      $('frame-caption').textContent = `${frame.source === 'upload' ? 'Loaded image' : 'Camera capture'} · ${frame.width} × ${frame.height} · ${new Date(frame.at).toLocaleTimeString()} · frozen frame`;
      $('perception-status').textContent = 'Only this selected frame is sent when you choose Analyze.';
    }
    document.querySelectorAll('#camera-thumbnails button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.frameId === frame?.id)));
    showResult(); regionUI();
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
  function changeTask(task) {
    cancel();focus=null;selecting=false;drag=null;$('perception-task').value=task;
    $('region-component').value=TARGETS[task] || 'scene';showResult();regionUI();
    $('perception-status').textContent='Target changed. Choose Analyze to request this target; earlier analyses remain in the export.';
  }
  function startMarking() {
    cancel();selecting=!selecting;drag=null;showResult();regionUI();
    if(selecting)$('frame-preview').scrollIntoView({block:'center',behavior:'instant'});
  }
  $('perception-task').addEventListener('change',()=>changeTask($('perception-task').value));
  for(const [value,label] of Object.entries({scene:'All components',...LABELS})){const option=node('option',label);option.value=value;$('region-component').append(option);}
  $('region-component').addEventListener('change',()=>changeTask(taskForComponent($('region-component').value)));
  $('region-mark').addEventListener('click',startMarking);
  $('region-clear').addEventListener('click',()=>setRegion(null));
  $('region-apply').addEventListener('click',()=>setRegion({component:$('region-component').value,...Object.fromEntries(['x','y','width','height'].map(key=>[key,Number($(`region-${key}`).value)]))}));
  const point=event=>{const bounds=$('frame-overlay').getBoundingClientRect();return {x:Math.round(Math.max(0,Math.min(selected.width,(event.clientX-bounds.left)*selected.width/bounds.width))),y:Math.round(Math.max(0,Math.min(selected.height,(event.clientY-bounds.top)*selected.height/bounds.height)))};};
  const rectangle=(a,b)=>({component:$('region-component').value,x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});
  $('frame-overlay').addEventListener('pointerdown',event=>{if(!selecting||!selected||pending||event.button!==0)return;event.preventDefault();drag={...point(event),pointerId:event.pointerId};$('frame-overlay').setPointerCapture(event.pointerId);});
  $('frame-overlay').addEventListener('pointermove',event=>{if(drag?.pointerId===event.pointerId)renderFocus(rectangle(drag,point(event)));});
  $('frame-overlay').addEventListener('pointerup',event=>{if(drag?.pointerId!==event.pointerId)return;const region=rectangle(drag,point(event));drag=null;$('frame-overlay').releasePointerCapture(event.pointerId);if(!setRegion(region))regionUI();});
  $('frame-overlay').addEventListener('pointercancel',()=>{drag=null;regionUI();});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&selecting){selecting=false;drag=null;showResult();regionUI();}});
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
    const frame = selected, caseId = getCaseId(), requestId = crypto.randomUUID(), task = $('perception-task').value, region = focus ? {...focus} : null;
    pending = true; updateButton(); $('perception-status').textContent = 'Analyzing this frame with Meta…';
    try {
      const bytes = Uint8Array.from(atob(frame.dataUrl.split(',')[1]), c => c.charCodeAt(0));
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2,'0')).join('');
      let crop=null, cropHash=null;
      if(region){
        await $('selected-frame').decode();
        if(current!==generation)return;
        const canvas=document.createElement('canvas');canvas.width=region.width;canvas.height=region.height;
        canvas.getContext('2d').drawImage($('selected-frame'),region.x,region.y,region.width,region.height,0,0,region.width,region.height);
        crop={...region,image:canvas.toDataURL('image/jpeg',.9)};
        const cropBytes=Uint8Array.from(atob(crop.image.split(',')[1]),c=>c.charCodeAt(0));
        cropHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',cropBytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
      }
      if (current !== generation) return;
      const response = await fetch('/api/perception/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70_000)]), body: JSON.stringify({ caseId, requestId, frameId:frame.id, capturedAt:frame.at, source:frame.source, width:frame.width, height:frame.height, image:frame.dataUrl, task, focus:crop }) });
      const result = await response.json(); if (current !== generation || caseId !== getCaseId()) return;
      if (!response.ok) throw new Error(result.error?.message || 'Analysis could not complete.');
      if (result.schema !== 'causa.perception.v3' || result.caseId !== caseId || result.requestId !== requestId || result.frame?.id !== frame.id || result.frame.sha256 !== hash || result.task !== task || result.frame.width !== frame.width || result.frame.height !== frame.height || regionKey(result.focus) !== regionKey(region) || (region && result.focus?.sha256 !== cropHash)) throw new Error('The response did not match this capture. No result was accepted.');
      analyses.push(result); frame.analyzed = true; showResult(); summary(); onChange();
      $('perception-status').textContent = 'Candidate ready for review. The simulated diagnosis is unchanged.';
    } catch (error) { if (current === generation) $('perception-status').textContent = error.name === 'TimeoutError' ? 'Analysis timed out. Try again.' : error.message || 'Analysis failed. Try again.'; }
    finally { if (current === generation) { pending = false; updateButton(); } }
  });
  connection(); summary(); regionUI();
  return { addFrame, cancel, reset() { cancel(); selected = null; focus = null; selecting = false; drag = null; analyses = []; reviews = []; $('frame-preview').hidden = true; $('selected-frame').removeAttribute('src'); $('frame-overlay').replaceChildren(); $('perception-result').replaceChildren(); $('perception-status').textContent = 'Select a frame to begin.'; summary(); regionUI(); }, export() { return { schema:'causa.validation.v3', analyses, reviews, liveModelAccuracy:'not_established', diagnosticEffect:'none' }; }, describe(frame) { const results = analyses.filter(a => a.frame.id === frame.id); return results.length ? `${results.length} model candidates · ${reviews.filter(r => r.frameId === frame.id).length} operator reviews · diagnosis unchanged` : 'Reference only; not model analyzed.'; } };
}
