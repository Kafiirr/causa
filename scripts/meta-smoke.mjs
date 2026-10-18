// Explicit, billable integration smoke test. Never run from npm test.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateFrame, imageDimensions, analyzeFrame, decodeSegmentation, MODEL_IDS } from '../server/perception.mjs';

const args=process.argv.slice(2);
const imagePath=args[args.indexOf('--image')+1];
if (!args.includes('--allow-live') || !args.includes('--image') || !imagePath) {
  console.error('Usage: node scripts/meta-smoke.mjs --allow-live --image <JPEG-or-PNG> [--sam]\nSends the specified image to Meta. Uses one Muse call and up to two SAM calls; --sam adds one standalone SAM call only when Muse selects no components.');
  process.exit(2);
}
const root=fileURLToPath(new URL('../',import.meta.url));
if (existsSync(resolve(root,'.env'))) process.loadEnvFile(resolve(root,'.env'));
if (!process.env.MODEL_API_KEY?.trim()) {console.error('Set MODEL_API_KEY in CAUSA .env or the process environment.');process.exit(2);}
const bytes=readFileSync(resolve(imagePath));
if(bytes.length>1_800_000){console.error('Use an image under 1.8 MB.');process.exit(2);}
const mime=bytes[0]===137?'image/png':'image/jpeg';
const frame=await validateFrame({caseId:'integration-smoke',requestId:crypto.randomUUID(),frameId:crypto.randomUUID(),source:'upload',capturedAt:new Date().toISOString(),task:'scene',...imageDimensions(bytes,mime),image:`data:${mime};base64,${bytes.toString('base64')}`});
const started=Date.now();
const report={at:new Date().toISOString(),kind:'integration_smoke_not_accuracy_evaluation',frame:{sha256:frame.sha256,width:frame.width,height:frame.height},models:MODEL_IDS};
try {
  const result=await analyzeFrame(frame,process.env);
  report.muse={status:'completed',usable:result.assessment.usable,outcome:result.assessment.outcome};
  report.sam=result.segmentations.map(s=>({component:s.component,status:s.status,objects:s.objects.length,...(s.error?{error:s.error}:{})}));
  report.usage=result.usage;
  if(args.includes('--sam') && !report.sam.length){
    const response=await fetch('https://api.meta.ai/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.MODEL_API_KEY.trim()}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:MODEL_IDS.segmentation,stream:true,metadata:{mask_encoding:'one_bit'},input:[{type:'message',role:'user',content:[{type:'input_text',text:'water valve'},{type:'input_image',image_url:frame.image}]}]})});
    if(!response.ok){await response.body?.cancel();throw Object.assign(new Error(),{code:`SAM_HTTP_${response.status}`});}
    const objects=await decodeSegmentation(response,frame);
    report.sam.push({component:'valve',status:'completed',objects:objects.length,standalone:true});report.usage.modelCalls++;
  }
  report.success=report.sam.every(s=>s.status==='completed');
} catch(error){report.success=false;report.errorCode=error.code || 'LIVE_SMOKE_FAILED';}
report.elapsedMs=Date.now()-started;
mkdirSync(resolve(root,'artifacts'),{recursive:true});
writeFileSync(resolve(root,'artifacts/meta-live-smoke.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.success)process.exitCode=1;
