const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const artifact = name => path.join(__dirname, '..', 'artifacts', name);
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

(async () => {
  await fs.mkdir(artifact(''), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ['camera'], acceptDownloads: true });
  const page = await context.newPage();
  // Keep the default browser suite offline even when local credentials exist.
  await page.route('**/api/perception/status', route => route.fulfill({json:{configured:false,message:'Meta access is not configured for this offline test.'}}));
  await page.route('**/api/perception/analyze', route => route.fulfill({status:503,json:{error:{code:'OFFLINE_TEST',message:'Live calls are disabled in browser tests.'}}}));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(process.env.CAUSA_TEST_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.screenshot({ path: artifact('causa-desktop.png'), fullPage: true });
  if (process.argv.includes('--visual-only')) {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(sizes.scroll <= sizes.width + 1);
      if (width === 390) await page.screenshot({ path: artifact('causa-mobile.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS final visual checks at 390, 768, and 1440 pixels');
    await browser.close();
    return;
  }

  async function fresh(fault) {
    await page.locator('#new-case').click();
    await page.locator('#fault-select').selectOption(fault);
    await page.getByRole('button', { name: 'Start investigation' }).click();
    await page.waitForFunction(() => document.querySelector('#metric-tests').textContent === '00');
  }
  async function testOnce() {
    await page.getByRole('button', { name: 'Commit prediction' }).click();
    assert.match(await page.locator('.prediction-box').textContent(), /PREDICTIONS COMMITTED/);
    await page.getByRole('button', { name: 'Run simulated test', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#experiment-actions button')?.disabled);
  }
  for (const fault of ['valve_closed', 'branch_kink', 'inlet_blockage', 'pump_off']) {
    await fresh(fault);
    await testOnce();
    assert.equal(await page.locator('#metric-causes').textContent(), '02');
    await testOnce();
    assert.equal(await page.locator('#metric-causes').textContent(), '01');
    assert.match(await page.locator('#metric-check').textContent(), /Pending/);
    await page.getByRole('button', { name: 'Apply simulated repair' }).click();
    assert.match(await page.locator('#metric-check').textContent(), /Pending/);
    await page.getByRole('button', { name: 'Run simulated flow check' }).click();
    await page.waitForFunction(() => document.querySelector('#metric-check').textContent.includes('Passed'));
    assert.match(await page.locator('#experiment-content').textContent(), /Operation restored/);
    console.log(`PASS browser diagnosis: ${fault}`);
  }

  await page.getByRole('button', { name: 'Inspect the evidence' }).click();
  assert.equal(await page.locator('.evidence-entry').count(), 7);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export-evidence').click();
  const download = await downloadEvent;
  await download.saveAs(artifact('causa-evidence-test.json'));
  const exported = JSON.parse(await fs.readFile(artifact('causa-evidence-test.json'), 'utf8'));
  assert.equal(exported.phase, 'complete');
  assert.equal(exported.mode, 'simulation');
  assert.equal(exported.events.at(-1).passed, true);
  console.log('PASS evidence export and simulation provenance');
  await page.screenshot({ path: artifact('causa-evidence.png'), fullPage: true });

  await page.locator('nav [data-page="lab"]').click();
  await fresh('branch_kink');
  await page.getByRole('button', { name: 'Commit prediction' }).click();
  await page.getByRole('button', { name: 'Mark observation as unclear' }).click();
  assert.equal(await page.locator('#metric-causes').textContent(), '04');
  assert.equal(await page.locator('#metric-tests').textContent(), '01');
  assert.match(await page.locator('#experiment-content').textContent(), /No causes were eliminated/);
  console.log('PASS unclear observation preserves hypotheses');

  await page.locator('#view-camera').click();
  await page.locator('#camera-enable').click();
  await page.waitForFunction(() => !document.querySelector('#camera-capture').disabled);
  await page.locator('#camera-capture').click();
  assert.equal(await page.locator('#camera-thumbnails img').count(), 1);
  assert.equal(await page.locator('#analyze-frame').isDisabled(), true);
  assert.match(await page.locator('#meta-connection').textContent(), /not configured/);
  console.log('PASS absent credentials keep analysis disabled');

  // Transport mocks only. These browser tests never contact Meta.
  let analysisCalls = 0, mode = 'success', lastPayload;
  await page.route('**/api/perception/status', route => route.fulfill({json:{configured:true,message:'Mock credentials for browser test only.'}}));
  await page.route('**/api/perception/analyze', async route => {
    analysisCalls++;
    const frame = route.request().postDataJSON(); lastPayload=frame;
    const currentMode = mode;
    if (currentMode === 'delay') await new Promise(resolve => setTimeout(resolve,700));
    if (currentMode === 'error') { await route.fulfill({status:502,json:{error:{message:'Test upstream unavailable.'}}}); return; }
    const sha256 = require('node:crypto').createHash('sha256').update(Buffer.from(frame.image.split(',')[1],'base64')).digest('hex');
    const target={valve:'main_valve',bypass:'bypass_valve',pump:'pump',reservoir:'reservoir',outlet:'outlet',tube:'tube',scene:null}[frame.task] || frame.focus?.component || 'reservoir';
    const focus=frame.focus ? {...frame.focus,sha256:require('node:crypto').createHash('sha256').update(Buffer.from(frame.focus.image.split(',')[1],'base64')).digest('hex'),source:'operator_selected'} : null;
    if(focus)delete focus.image;
    if(focus && currentMode==='cropMismatch')focus.sha256='wrong-crop';
    const x=focus?.x || 0,y=focus?.y || 0;
    const objects=currentMode==='empty'?[]:[{objectId:'0',box:{x1:x+2,y1:y+2,x2:x+15,y2:y+15},mask:{width:4,height:4,path:'M0 0L4 0L4 4L0 4Z'}}];
    const result={schema:'causa.perception.v4',id:`mock-${analysisCalls}`,caseId:frame.caseId,requestId:currentMode==='mismatch'?'wrong-request':frame.requestId,task:frame.task,target,focus,frame:{id:frame.frameId,sha256,width:frame.width,height:frame.height,source:frame.source,capturedAt:frame.capturedAt},models:{reasoning:'muse-spark-1.3',segmentation:'sam-3.1'},elapsedMs:50,assessment:{summary:'Candidate valve <img src=x onerror=alert(1)>',outcome:'unknown',reason:'Unclear view.',limitations:['Synthetic test fixture.'],components:[{component:target,visibility:'visible',orientation:currentMode==='conflict'?'perpendicular':'parallel',handleType:'lever',observation:'Visible test target'}]},segmentations:[{component:target,status:'completed',scope:focus?'operator_region':'full_frame',identity:'unverified',coordinateSpace:'original_frame',objects}],limitations:['Does not verify a repair.'],verification:'unreviewed_candidate',diagnosticEffect:'none'};
    if(currentMode==='sections'){
      result.assessment.components[0].grounding={box:{x1:20,y1:20,x2:100,y2:40},boxes:[{x1:20,y1:20,x2:100,y2:40},{x1:20,y1:70,x2:100,y2:90}],evidence:'Two sections'};
      result.segmentations[0].proposalCoverage={proposed:2,supported:1,completeComponentVerified:false};
      result.segmentations[0].concepts=[{prompt:'plastic tube',status:'completed',count:1},{prompt:'pipe',status:'completed',count:1}];
      result.unresolvedRegions=[{prompt:'plastic tube',objectId:'pipe:0',box:{x1:120,y1:20,x2:150,y2:50},mask:{width:1,height:1,path:'M0 0L1 0L1 1Z'},reason:'no_supported_component_box'}];
    }
    if(currentMode==='grounding'){
      result.assessment.components[0].grounding={box:{x1:20,y1:20,x2:100,y2:100},source:'muse_candidate',basis:'visual_context',evidence:'Test location'};
      result.segmentations[0].objects=[];result.segmentations[0].rawMatches=1;
      result.unresolvedRegions=[{prompt:'valve',box:{x1:120,y1:20,x2:150,y2:50},reason:'no_supported_component_box'}];
    }
    await route.fulfill({json:result}).catch(()=>{});
  });
  await page.locator('#meta-refresh').click();
  await page.waitForFunction(()=>!document.querySelector('#analyze-frame').disabled);
  assert.equal(analysisCalls,0);
  await page.locator('#region-component').selectOption('main_valve');
  assert.equal(await page.locator('#perception-task').inputValue(),'valve');
  await page.locator('#analyze-frame').click();
  await page.waitForFunction(()=>document.querySelector('.review-form'));
  assert.equal(await page.locator('#frame-overlay path').count(),1);
  assert.equal(await page.locator('#perception-result img').count(),0);
  assert.equal(await page.locator('#metric-causes').textContent(),'04');
  await page.locator('[name="observation_main_valve"]').selectOption('unclear');
  await page.locator('[name="segmentation_main_valve"]').selectOption('incorrect');
  await page.locator('[name="referenceOutcome"]').selectOption('unknown');
  await page.getByRole('button',{name:'Save review',exact:true}).click();
  assert.match(await page.locator('#review-summary').textContent(),/Main valve: 0\/0 assessable descriptions matching.*1 unclear/);
  await page.locator('#camera-stop').click();
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:1100});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
    await page.locator('#perception-panel').screenshot({path:artifact(`causa-perception-${width}.png`)});
  }
  console.log('PASS frozen overlays, safe text rendering, independent review, responsive camera panel');

  mode='mismatch'; await page.locator('#analyze-frame').click();
  await page.waitForFunction(()=>document.querySelector('#perception-status').textContent.includes('did not match'));
  assert.match(await page.locator('#review-summary').textContent(),/^1 analyses/);
  mode='error'; await page.locator('#analyze-frame').click();
  await page.waitForFunction(()=>document.querySelector('#perception-status').textContent.includes('upstream unavailable'));
  assert.equal(await page.locator('#analyze-frame').isDisabled(),false);
  console.log('PASS mismatched response rejection and retryable provider error');

  await page.locator('nav [data-page="evidence"]').click();
  assert.equal(await page.locator('#attachment-list img').count(), 1);
  assert.equal(await page.evaluate(() => document.querySelector('#camera-video').srcObject), null);
  console.log('PASS camera capture, reference labeling, and automatic stop');
  const reviewDownload=page.waitForEvent('download'); await page.locator('#export-evidence').click();
  const reviewFile=await reviewDownload; await reviewFile.saveAs(artifact('causa-review-test.json'));
  const reviewed=JSON.parse(await fs.readFile(artifact('causa-review-test.json'),'utf8'));
  assert.equal(reviewed.perception.analyses.length,1); assert.equal(reviewed.perception.reviews.length,1);
  assert.equal(reviewed.perception.reviews[0].sha256,reviewed.perception.analyses[0].frame.sha256);
  assert.equal(reviewed.mode,'simulation');
  await page.locator('nav [data-page="lab"]').click(); await page.locator('#view-camera').click();
  mode='delay'; const callsBefore=analysisCalls; const pendingRequest=page.waitForRequest('**/api/perception/analyze'); await page.locator('#analyze-frame').click();
  await pendingRequest;
  await fresh('pump_off'); await page.waitForTimeout(850);
  assert.equal(analysisCalls,callsBefore+1); assert.match(await page.locator('#review-summary').textContent(),/^0 analyses/);
  assert.equal(await page.locator('#frame-overlay path').count(),0);
  assert.equal(await page.locator('#frame-preview').isVisible(),false);
  console.log('PASS review export and cancellation on case reset');
  assert.equal(await page.locator('#analyze-frame').isDisabled(),true);
  await page.locator('#view-camera').click();
  const uploadedBytes=Buffer.from(reviewed.attachments[0].dataUrl.split(',')[1],'base64');
  await page.locator('#frame-upload').setInputFiles({name:'rig-fixture.jpg',mimeType:'image/jpeg',buffer:uploadedBytes});
  await page.waitForFunction(()=>document.querySelector('#frame-caption').textContent.startsWith('Loaded image'));
  assert.equal(await page.locator('#camera-thumbnails img').count(),1);
  assert.equal(analysisCalls,callsBefore+1);
  console.log('PASS local image loading does not automatically call Meta');
  // A miss is component-specific; a selected crop has its own hash and source geometry.
  mode='empty'; await page.locator('#perception-task').selectOption('pump');
  await page.locator('#analyze-frame').click();await page.waitForSelector('[name="segmentation_pump"]');
  assert.equal(await page.locator('[name="segmentation_pump"] option[value="matches"]').count(),0);
  assert.match(await page.locator('.component-observation[data-component="pump"]').textContent(),/No matching region found/);
  await page.locator('[name="observation_pump"]').selectOption('matches');
  await page.locator('[name="segmentation_pump"]').selectOption('missed');
  await page.getByRole('button',{name:'Save review',exact:true}).click();
  assert.match(await page.locator('#review-summary').textContent(),/Pump: 1\/1 assessable descriptions matching · 0\/1 assessable SAM localizations matching · 0 partial · 1 missed/);
  await page.getByRole('button',{name:'Mark pump region',exact:true}).click();
  assert.equal(await page.locator('#analyze-frame').isDisabled(),true);
  await page.locator('#frame-preview').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));
  const bounds=await page.locator('#frame-overlay').boundingBox();
  await page.mouse.move(bounds.x+bounds.width*.15,bounds.y+bounds.height*.2);await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*.45,bounds.y+bounds.height*.6);await page.mouse.up();
  assert.equal(await page.locator('#region-mark').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('.manual-region').count(),1);
  assert.equal(await page.locator('.review-saved').count(),0);
  assert.match(await page.locator('#region-status').textContent(),/operator-selected region/);
  mode='success'; await page.locator('#analyze-frame').click();await page.waitForSelector('[name="segmentation_pump"]');
  assert.ok(lastPayload.focus.width>=16);assert.equal(lastPayload.focus.component,'pump');
  assert.notEqual(lastPayload.focus.image,lastPayload.image);
  assert.equal(Number(await page.locator('.sam-box').getAttribute('x')),lastPayload.focus.x+2);
  await page.locator('.overlay-toggle input').uncheck();assert.equal(await page.locator('.sam-box').isVisible(),false);
  await page.locator('.overlay-toggle input').check();
  assert.match(await page.locator('#review-summary').textContent(),/^2 analyses across 1 distinct images/);
  mode='cropMismatch';await page.locator('#analyze-frame').click();
  await page.waitForFunction(()=>document.querySelector('#perception-status').textContent.includes('did not match'));
  assert.match(await page.locator('#review-summary').textContent(),/^2 analyses/);
  await page.locator('#region-clear').click();
  assert.equal(await page.locator('.manual-region').count(),0);
  assert.match(await page.locator('.review-saved').textContent(),/Review saved/);
  await page.locator('#region-controls summary').click();
  for(const [key,value] of Object.entries({x:20,y:30,width:80,height:60}))await page.locator(`#region-${key}`).fill(String(value));
  await page.locator('#region-apply').click();assert.equal(await page.locator('.manual-region').getAttribute('x'),'20');
  assert.equal(await page.locator('.manual-region').getAttribute('width'),'80');
  await page.locator('#perception-task').selectOption('bypass');
  assert.equal(await page.locator('.manual-region').count(),0);assert.equal(await page.locator('#region-component').inputValue(),'bypass_valve');
  await page.locator('#region-component').selectOption('outlet');
  assert.equal(await page.locator('#perception-task').inputValue(),'outlet');
  assert.equal(await page.locator('.sam-box').count(),0);
  mode='success';await page.locator('#analyze-frame').click();await page.waitForSelector('[name="segmentation_outlet"]');
  assert.equal(lastPayload.task,'outlet');assert.equal(lastPayload.focus,null);
  assert.match(await page.locator('#overlay-legend').textContent(),/Outlet container/);
  assert.equal(await page.locator('#frame-overlay text').count(),0);
  assert.equal(await page.locator('.component-detail').isVisible(),false);
  await page.locator('#region-mark').click();
  assert.equal(await page.locator('.sam-box').count(),0);assert.equal(await page.locator('#mark-instruction').isVisible(),true);
  await page.locator('#region-mark').click();
  assert.equal(await page.locator('.sam-box').count(),1);
  await page.locator('#region-component').selectOption('main_valve');
  mode='success';await page.locator('#analyze-frame').click();await page.waitForSelector('[name="segmentation_main_valve"]');
  mode='conflict';await page.locator('#analyze-frame').click();await page.waitForSelector('.claim-conflict');
  assert.match(await page.locator('.claim-conflict').textContent(),/disagree on orientation/);
  await page.locator('#region-component').selectOption('pump');
  mode='grounding';await page.locator('#analyze-frame').click();await page.waitForSelector('[name="grounding_pump"]');
  assert.equal(await page.locator('.sam-mask').count(),0);assert.equal(await page.locator('.muse-box').isVisible(),true);
  assert.equal(await page.locator('[name="segmentation_pump"] option[value="matches"]').count(),0);
  assert.equal(await page.locator('.unresolved-box').isVisible(),false);
  await page.getByLabel(/Show 1 unassigned SAM/).check();
  assert.equal(await page.locator('.unresolved-box').isVisible(),true);
  assert.match(await page.locator('g[data-component="unresolved"] title').textContent(),/^valve · unresolved$/);
  await page.getByLabel('Show approximate pump Muse box').uncheck();assert.equal(await page.locator('.muse-box').isVisible(),false);
  await page.getByLabel('Show approximate pump Muse box').check();
  const beforeProposal=analysisCalls;
  await page.locator('.proposal-inspection summary').click();
  await page.getByRole('button',{name:'Use proposed pump crop',exact:true}).click();
  assert.equal(analysisCalls,beforeProposal);
  assert.match(await page.locator('#region-status').textContent(),/Muse proposal selected as crop/);
  assert.equal(await page.locator('.manual-region').count(),1);
  mode='success';await page.locator('#analyze-frame').click();await page.waitForSelector('[name="segmentation_pump"]');
  assert.equal(lastPayload.focus.selectionMethod,'muse_proposal');
  assert.ok(lastPayload.focus.x<20 && lastPayload.focus.width>80);
  await page.locator('#region-clear').click();
  await page.locator('[name="observation_pump"]').selectOption('matches');
  await page.locator('[name="grounding_pump"]').selectOption('incorrect');
  await page.locator('[name="segmentation_pump"]').selectOption('missed');
  await page.getByRole('button',{name:'Save review',exact:true}).click();
  assert.match(await page.locator('#review-summary').textContent(),/0\/1 assessable Muse boxes matching/);
  await page.locator('#region-component').selectOption('tube');
  mode='sections';await page.locator('#analyze-frame').click();await page.waitForSelector('[name="grounding_tube"]');
  assert.equal(await page.locator('.muse-box').count(),2);
  assert.match(await page.locator('.component-observation').textContent(),/1\/2 Muse proposals/);
  assert.equal(await page.locator('.unresolved-box').isVisible(),true);
  assert.equal(await page.locator('g[data-component="unresolved"] .sam-mask').count(),1);
  assert.match(await page.locator('.component-observation').textContent(),/pipe: 1 raw matches/);
  await page.getByLabel(/Show 1 unassigned tubing/).uncheck();
  assert.equal(await page.locator('.unresolved-box').isVisible(),false);
  await page.getByLabel('Show approximate tubing Muse box').check();
  assert.equal(await page.locator('.muse-box:visible').count(),2);
  await page.getByLabel('Show approximate tubing Muse box').uncheck();
  assert.equal(await page.locator('.muse-box:visible').count(),0);
  await page.locator('[name="observation_tube"]').selectOption('matches');
  await page.locator('[name="grounding_tube"]').selectOption('matches');
  await page.locator('[name="segmentation_tube"]').selectOption('partial');
  await page.getByRole('button',{name:'Save review',exact:true}).click();
  assert.match(await page.locator('#review-summary').textContent(),/Tubing: 1\/1 assessable descriptions matching · 0\/1 assessable SAM localizations matching · 1 partial/);
  console.log('PASS Muse box fallback is separately reviewed and cannot disguise a SAM miss; unresolved labels remain generic');
  console.log('PASS component selectors drive full-frame requests, stale overlays clear, marking hides AI masks, and repeated contradictions are flagged');
  console.log('PASS component misses, drag/numeric crop selection, mapped masks, crop binding, distinct images, and task reset');
  await page.locator('#view-rig').click();
  assert.equal(await page.locator('.component-detail').isVisible(),true);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['lab', 'evidence', 'kit']) {
      await page.locator(`nav [data-page="${name}"]`).click();
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(dimensions.scroll <= dimensions.width + 1, `Overflow on ${name} at ${width}: ${dimensions.scroll}`);
    }
    console.log(`PASS responsive layouts: ${width}px`);
  }
  await page.locator('nav [data-page="lab"]').click();
  await fresh('inlet_blockage');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: artifact('causa-mobile.png'), fullPage: true });
  await page.locator('#layout-select').selectOption('b');
  assert.match(await page.locator('#rig-svg').getAttribute('class'), /rig-reversed/);
  console.log('PASS alternate layout');

  await page.getByRole('button', { name: 'Commit prediction' }).click();
  await page.getByRole('button', { name: 'Run simulated test', exact: true }).click();
  await fresh('pump_off');
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#metric-causes').textContent(), '04');
  assert.equal(await page.locator('#metric-tests').textContent(), '00');
  console.log('PASS new case cancels stale observations');

  assert.deepEqual(errors, []);
  await fresh('pump_off');await page.locator('#view-camera').click();
  const detailed=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1680;c.height=1050;c.getContext('2d').fillRect(0,0,c.width,c.height);return c.toDataURL('image/png');});
  const beforeUpload=analysisCalls;
  await page.locator('#frame-upload').setInputFiles({name:'detail.png',mimeType:'image/png',buffer:Buffer.from(detailed.split(',')[1],'base64')});
  await page.waitForFunction(()=>document.querySelector('#frame-caption').textContent.includes('1680 × 1050'));
  assert.equal(analysisCalls,beforeUpload);
  await page.locator('#selected-frame').evaluate(img=>img.decode());
  assert.equal(await page.locator('#selected-frame').evaluate(img=>img.naturalWidth),1680);
  console.log('PASS source detail retained above 960 pixels and proposal crops require explicit analysis');
  console.log('PASS no browser JavaScript errors');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
