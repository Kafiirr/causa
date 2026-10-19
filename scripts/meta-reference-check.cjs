// Opt-in, billable check on a supplied reference image. Not an accuracy benchmark.
const args=process.argv.slice(2), imagePath=args[args.indexOf('--image')+1];
if(!args.includes('--allow-live') || !args.includes('--image') || !imagePath){
  console.error('Usage: meta-reference-check.cjs --allow-live --image <path>');process.exit(2);
}
const task=args.includes('--task')?args[args.indexOf('--task')+1]:'scene';
const region=args.includes('--region')?args[args.indexOf('--region')+1].split(',').map(Number):null;
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.CAUSA_TEST_URL || 'http://127.0.0.1:4173',{waitUntil:'networkidle'});
    await page.locator('#view-camera').click();
    await page.locator('#frame-upload').setInputFiles(imagePath);
    await page.locator('#perception-task').selectOption(task);
    if(region){await page.locator('#region-controls summary').click();for(const [i,key] of ['x','y','width','height'].entries())await page.locator(`#region-${key}`).fill(String(region[i]));await page.locator('#region-apply').click();}
    await page.waitForFunction(()=>!document.querySelector('#analyze-frame').disabled);
    const waiting=page.waitForResponse(r=>r.url().endsWith('/api/perception/analyze'),{timeout:75000});
    await page.locator('#analyze-frame').click();
    const response=await waiting,result=await response.json();
    assert.equal(response.status(),200,result.error?.message);assert.equal(result.schema,'causa.perception.v4');
    assert.equal(Boolean(result.focus),Boolean(region));assert.equal(result.segmentations.length,task==='scene'?6:1);
    if(task==='scene'){
      assert.equal(result.detections.filter(d=>d.prompt==='valve').length,1);
      const main=result.segmentations.find(s=>s.component==='main_valve'),bypass=result.segmentations.find(s=>s.component==='bypass_valve');
      assert.ok(!main.objects.some(m=>bypass.objects.some(b=>b.objectId===m.objectId)));
    }
    for(const claim of result.assessment.components.filter(c=>c.handleType==='t_handle'))assert.equal(claim.orientation,'unknown');
    await page.waitForSelector('.review-form');
    assert.equal(await page.locator('#metric-causes').textContent(),'04');
    const artifact=path.join(__dirname,'..','artifacts');await fs.mkdir(artifact,{recursive:true});
    await fs.writeFile(path.join(artifact,`meta-reference-${task}${region?'-crop':''}-result.json`),JSON.stringify(result,null,2));
    await page.locator('.frame-stage').screenshot({path:path.join(artifact,`meta-reference-${task}${region?'-crop':''}-overlay.png`)});
    const report={at:new Date().toISOString(),kind:'single_reference_integration_not_accuracy_benchmark',task,focus:result.focus,usable:result.assessment.usable,elapsedMs:result.elapsedMs,usage:result.usage,components:result.assessment.components.map(c=>({component:c.component,visibility:c.visibility,handleType:c.handleType,orientation:c.orientation,grounding:c.grounding})),sam:result.segmentations.map(s=>({component:s.component,status:s.status,rawMatches:s.rawMatches,proposalCoverage:s.proposalCoverage,assigned:s.objects.map(o=>({box:o.box,extent:o.extent}))})),unresolved:result.unresolvedRegions.length};
    await fs.writeFile(path.join(artifact,`meta-reference-${task}${region?'-crop':''}-report.json`),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
