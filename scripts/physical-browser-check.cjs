const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},permissions:['camera'],acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/perception/**',r=>r.fulfill({json:{configured:false}}));
 await page.goto(process.env.CAUSA_TEST_URL || 'http://127.0.0.1:4183');
 async function fresh(){await page.locator('#new-case').click();await page.locator('#case-mode').selectOption('physical');await page.locator('#setup-note').fill('Bench A: reservoir, pump, two independent branches, cup. Connections checked.');await page.locator('#setup-confirm').check();await page.locator('#min-rate').fill('8');await page.locator('#min-seconds').fill('12');await page.getByRole('button',{name:'Start investigation',exact:false}).click();assert.equal(await page.getByRole('button',{name:'Run simulated test',exact:true}).count(),0);}
 async function record(outcome,note='Observed on bench with reviewed procedure') {await page.locator('#physical-outcome').selectOption(outcome);await page.locator('#physical-note').fill(note);await page.locator('#physical-reset').check();}
 async function measured(volume,seconds='12'){await page.locator('#physical-volume').fill(String(volume));await page.locator('#physical-seconds').fill(seconds);}
 await fresh();await page.getByRole('button',{name:'Commit prediction',exact:true}).click();
 await record('unknown','Outlet obscured; unable to observe.');await page.getByRole('button',{name:'Record observation',exact:true}).click();assert.equal(await page.locator('#metric-causes').textContent(),'04');
 await page.getByRole('button',{name:'Commit prediction',exact:true}).click();await record('measured');await measured(50);
 for(const width of [390,768,1440]) {await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/physical-evidence-form.png',fullPage:true});
 // Adding a reference must not erase the operator's in-progress form.
 await page.locator('#view-camera').click();await page.locator('#camera-enable').click();await page.waitForFunction(()=>!document.querySelector('#camera-capture').disabled);await page.locator('#camera-capture').click();
 assert.equal(await page.locator('#physical-volume').inputValue(),'50');assert.equal(await page.locator('#physical-note').inputValue(),'Observed on bench with reviewed procedure');
 await page.locator('#physical-reference').selectOption('0');await page.getByRole('button',{name:'Record observation',exact:true}).click();assert.equal(await page.locator('#metric-causes').textContent(),'02');
 await page.getByRole('button',{name:'Commit prediction',exact:true}).click();await record('closed','Known valve indicator shows closed.');await page.locator('#physical-state').check();await page.getByRole('button',{name:'Record observation',exact:true}).click();
 assert.match(await page.locator('#solution-summary').textContent(),/Open the main valve/);
 await page.locator('#physical-note').fill('Opened main valve; bypass remains closed.');await page.getByRole('button',{name:'Record repair attempted'}).click();
 await measured(90);await page.locator('#physical-note').fill('Measured with marked cup and stopwatch.');await page.locator('#physical-reset').check();await page.getByRole('button',{name:'Record functional check'}).click();assert.match(await page.locator('#solution-summary').textContent(),/CHECK FAILED/);
 await page.locator('#physical-note').fill('Checked valve was fully open.');await page.getByRole('button',{name:'Record repair attempted'}).click();await measured(96);await page.locator('#physical-note').fill('96 mL collected in 12 seconds, timed manually.');await page.locator('#physical-reset').check();await page.getByRole('button',{name:'Record functional check'}).click();assert.match(await page.locator('#solution-summary').textContent(),/REPORTED CHECK PASSED/);
 for(const width of [390,768,1440]) {await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/physical-complete.png',fullPage:true});
 await page.getByRole('button',{name:'Inspect the evidence',exact:true}).click();const download=page.waitForEvent('download');await page.locator('#export-evidence').click();const d=await download;const exp=JSON.parse(await fs.readFile(await d.path(),'utf8'));assert.equal(exp.mode,'physical');assert.equal(exp.phase,'complete');assert.ok(!exp.events.some(e=>e.source==='simulated_rig'));assert.equal(exp.events.filter(e=>e.type==='observation')[1].references.length,1);assert.equal(exp.events.at(-1).rateMlPerSecond,8);
 await page.getByRole('button',{name:'Investigation',exact:true}).click();await fresh();await page.getByRole('button',{name:'Commit prediction',exact:true}).click();await record('measured');await measured(50);await page.getByRole('button',{name:'Record observation',exact:true}).click();await page.locator('#physical-test').selectOption('pump');await page.getByRole('button',{name:'Commit prediction',exact:true}).click();await record('stopped');await page.getByRole('button',{name:'Record observation',exact:true}).click();assert.match(await page.locator('#solution-summary').textContent(),/Evidence conflicts/);assert.equal(await page.getByRole('button',{name:'Record repair attempted'}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS physical workflow, uncertainty, conflict, failed/retried verification, linked frame export, preserved form input and responsive layouts');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
