const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const {validatePlanningContext,PROMPT_VERSION}=await import('../public/planning.js');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let mode='ok',requests=[];
  await page.route('**/api/perception/**',r=>r.fulfill({json:{configured:false}}));
  await page.route('**/api/planner',async r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{provider:'baseten',model:'meta-models/muse-spark-open-1026',configured:true}});
   const input=r.request().postDataJSON();requests.push(input);
   if(mode==='error')return r.fulfill({status:502,json:{error:{message:'Provider unavailable; no plan recorded.'}}});
   const {tests}=validatePlanningContext(input);const test=tests[0];
   const plan={testId:test.id,predictions:test.predictions,rationale:'Compare the remaining causes. <img src=x onerror=alert(1)>'};
   await r.fulfill({json:{schema:PROMPT_VERSION,id:crypto.randomUUID(),createdAt:new Date().toISOString(),provider:'baseten',model:'meta-models/muse-spark-open-1026',input,plan,rawOutput:JSON.stringify(plan),usage:{modelCalls:1},elapsedMs:42}});
  });
  await page.goto(process.env.CAUSA_TEST_URL || 'http://127.0.0.1:4196');
  await page.locator('#new-case').click();await page.locator('#case-mode').selectOption('physical');
  await page.locator('#setup-note').fill('Bench connections checked against reviewed topology.');await page.locator('#setup-confirm').check();await page.locator('#min-rate').fill('10');
  await page.getByRole('button',{name:'Start investigation',exact:false}).click();
  await page.locator('#physical-test').selectOption('valve');
  assert.match(await page.locator('#experiment-content h3').textContent(),/valve/i);
  await page.locator('#planner-access-bypass').uncheck();await page.locator('#planner-access-valve').uncheck();
  await page.getByRole('button',{name:'Propose next test',exact:true}).click();
  await page.locator('#planner-rationale').waitFor();assert.deepEqual(requests[0].availableTests,['pump']);
  assert.equal(await page.locator('#metric-causes').textContent(),'04');assert.equal(await page.locator('#physical-outcome').count(),0);
  assert.equal(await page.locator('#planner-rationale img').count(),0);
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/planner-proposal.png',fullPage:true});
  await page.getByRole('button',{name:'Decline and choose a test',exact:true}).click();
  await page.getByRole('button',{name:'Propose next test',exact:true}).click();await page.locator('#planner-rationale').waitFor();
  await page.getByRole('button',{name:'Accept plan and commit prediction',exact:true}).click();
  await page.locator('#physical-outcome').selectOption('unknown');await page.locator('#physical-note').fill('Unable to measure the outlet in this test.');await page.locator('#physical-reset').check();
  await page.getByRole('button',{name:'Record observation',exact:true}).click();assert.equal(await page.locator('#metric-causes').textContent(),'04');
  mode='error';await page.getByRole('button',{name:'Propose next test',exact:true}).click();await page.getByText('Provider unavailable; no plan recorded.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Commit prediction',exact:true}).count(),1);
  await page.locator('nav [data-page="evidence"]').click();
  const downloading=page.waitForEvent('download');await page.locator('#export-evidence').click();const download=await downloading;
  const data=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  assert.equal(data.events.filter(e=>e.type==='plan_proposed').length,2);
  assert.deepEqual(data.events.filter(e=>e.type==='plan_decision').map(e=>e.decision),['declined','accepted']);
  assert.equal(data.events.filter(e=>e.type==='prediction_committed').length,1);
  assert.equal(data.events.find(e=>e.type==='plan_proposed').proposal.model,'meta-models/muse-spark-open-1026');
  assert.deepEqual(errors,[]);console.log('PASS mocked planner: availability, safe rationale, decline/accept, explicit commitment, uncertainty, failure recovery, export and responsive layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
