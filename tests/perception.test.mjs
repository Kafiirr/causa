import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFrame, validateAssessment, createPerceptionHandler, decodeSegmentation, responseEvents } from '../server/perception.mjs';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const input = (extra = {}) => ({ caseId:'case1', frameId:'frame1', requestId:'request1', source:'camera', capturedAt:new Date().toISOString(), task:'valve', width:1, height:1, image, ...extra });
const observation = (extra = {}) => ({ summary:'Main valve visible', usable:true, limitations:['The image cannot establish flow.'], outcome:'open', reason:'The labeled main valve appears open.', components:[{component:'valve',observation:'Visible handle'}], segment:['valve'], ...extra });
const spark = (value = observation()) => Response.json({ choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}], usage:{prompt_tokens:100,completion_tokens:50} });
const request = (body = input(), headers = {}) => new Request('https://causa.test/api/perception/analyze', { method:'POST', headers:{origin:'https://causa.test','content-type':'application/json','oai-authenticated-user-id':'owner',...headers}, body:JSON.stringify(body) });
const env = { MODEL_API_KEY:'test-key-not-real' };
const handler = options => createPerceptionHandler({ rateBuckets:new Map(), ...options });

test('missing key is explicit and makes zero upstream requests', async () => {
  const gateway = handler({fetcher:() => assert.fail('upstream call')});
  const response = await gateway(request());
  assert.equal(response.status,503); assert.equal((await response.json()).error.code,'META_NOT_CONFIGURED');
  const status = await gateway(new Request('https://causa.test/api/perception/status'),env);
  const body = await status.text(); assert.ok(!body.includes(env.MODEL_API_KEY)); assert.equal(JSON.parse(body).configured,true);
});
test('authenticated same-origin JSON is required before upstream work', async () => {
  const gateway = handler({fetcher:() => assert.fail('upstream call')});
  for (const [headers,status] of [[{'oai-authenticated-user-id':''},401],[{origin:'https://evil.test'},403],[{'content-type':'text/plain'},415]]) assert.equal((await gateway(request(input(),headers),env)).status,status);
});
test('frame validation binds bytes, dimensions, source and freshness', async () => {
  const frame = await validateFrame(input()); assert.match(frame.sha256,/^[a-f0-9]{64}$/);
  assert.equal(frame.sha256,(await validateFrame(input())).sha256);
  for (const patch of [{image:'https://evil.test/image.jpg'},{width:2},{source:'sensor'},{task:'repair'},{caseId:'../case'},{capturedAt:'2000-01-01'},{image:'data:image/png;base64,AAAA'}]) await assert.rejects(validateFrame(input(patch)));
});
test('single frames cannot establish pump or bypass outcomes', () => {
  for (const task of ['pump','bypass','scene']) assert.equal(validateAssessment(observation(),task).outcome,'unknown');
  assert.equal(validateAssessment(observation({usable:false}),'valve').outcome,'unknown');
  assert.deepEqual(validateAssessment(observation({usable:false}),'valve').segment,[]);
  assert.throws(() => validateAssessment(observation({segment:['valve','pump','outlet']}),'valve'));
  assert.throws(() => validateAssessment(observation({components:[{component:'__proto__',observation:'x'}]}),'valve'));
});
test('Muse and SAM requests use documented models, exact frame, and server-only auth', async () => {
  const calls=[];
  const gateway=handler({fetcher:async (url,options) => { calls.push({url,...options,payload:JSON.parse(options.body)}); return calls.length===1 ? spark() : new Response('mock segmentation'); }, decode:async () => []});
  const response=await gateway(request(),env); assert.equal(response.status,200);
  const result=await response.json(); assert.equal(result.diagnosticEffect,'none'); assert.equal(result.verification,'unreviewed_candidate');
  assert.equal(result.frame.id,'frame1'); assert.match(result.frame.sha256,/^[a-f0-9]{64}$/);
  assert.equal(calls.length,2); assert.equal(calls[0].url,'https://api.meta.ai/v1/chat/completions'); assert.equal(calls[0].payload.model,'muse-spark-1.3');
  assert.equal(calls[0].payload.messages[1].content[1].image_url.url,image);
  assert.equal(calls[1].url,'https://api.meta.ai/v1/responses'); assert.equal(calls[1].payload.model,'sam-3.1'); assert.equal(calls[1].payload.metadata.mask_encoding,'one_bit');
  assert.equal(calls[1].payload.input[0].content[0].text,'water valve');
  for (const call of calls) assert.equal(call.headers.Authorization,`Bearer ${env.MODEL_API_KEY}`);
  assert.ok(!JSON.stringify(result).includes(env.MODEL_API_KEY));
});
test('SAM failure remains distinguishable from completed empty segmentation', async () => {
  const gateway=handler({fetcher:async url => url.endsWith('/chat/completions') ? spark() : new Response('secret upstream body',{status:500})});
  const result=await (await gateway(request(),env)).json();
  assert.equal(result.segmentations[0].status,'failed'); assert.match(result.limitations.at(-1),/Missing overlays/); assert.ok(!JSON.stringify(result).includes('secret upstream body'));
});
test('invalid or truncated model output is not accepted', async () => {
  for (const reply of [() => Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]}), () => spark({}), () => new Response('not-json'), () => new Response('sensitive-provider-error',{status:401})]) {
    const result=await handler({fetcher:reply})(request(),env); assert.equal(result.status,502); assert.ok(!(await result.text()).includes('sensitive-provider-error'));
  }
});
test('concurrent rejections do not unlock the active analysis', async () => {
  let release; const waiting=new Promise(resolve => {release=resolve;}); let calls=0;
  const gateway=handler({fetcher:async () => {calls++; await waiting; return spark(observation({segment:[]}));}});
  const first=gateway(request(),env);
  while(calls===0) await new Promise(resolve => setTimeout(resolve,1));
  for(let i=0;i<2;i++) {const response=await gateway(request(),env); assert.equal(response.status,429); assert.equal((await response.json()).error.code,'ANALYSIS_IN_PROGRESS');}
  release(); assert.equal((await first).status,200); assert.equal(calls,1);
});
test('four-per-minute local rate limit and expiry', async () => {
  let now=Date.now(); const gateway=handler({clock:()=>now,fetcher:async()=>spark(observation({segment:[]}))});
  for(let i=0;i<4;i++) assert.equal((await gateway(request(),env)).status,200);
  assert.equal((await gateway(request(),env)).status,429); now+=61000;
  assert.equal((await gateway(request(),env)).status,200);
});
test('body size guard rejects excess bytes before parsing or model calls', async () => {
  const response=await handler({fetcher:()=>assert.fail()})(request({large:'x'.repeat(2_500_000)}),env); assert.equal(response.status,413);
});
test('SSE decoder accepts split events and rejects malformed payloads', async () => {
  const encoder=new TextEncoder(); const chunks=['data: {"type":"response.', 'created"}\r', '\n\r\ndata: [DONE]\n\n'];
  const response=new Response(new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(encoder.encode(chunk));c.close();}}),{headers:{'content-type':'text/event-stream'}});
  const output=[]; for await (const event of responseEvents(response))output.push(event); assert.deepEqual(output,[{type:'response.created'}]);
  await assert.rejects(async()=>{for await(const event of responseEvents(new Response('data: {bad}\n\n',{headers:{'content-type':'text/event-stream'}})))void event;});
});
test('EOF alone is not a successful SAM result', async()=> {
  await assert.rejects(decodeSegmentation(new Response('',{headers:{'content-type':'text/event-stream'}}),{width:1,height:1}));
});

// Documented lossless example: https://dev.meta.ai/docs/sam/reading-segmentation
const sample = "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>";
function samStream(text, complete=true) {
  const lane={item_id:'message1',output_index:0,content_index:0};
  const events=[{type:'response.output_text.delta',...lane,delta:text.slice(0,45)},{type:'response.output_text.delta',...lane,delta:text.slice(45)},{type:'response.output_text.done',...lane,text},...(complete ? [{type:'response.completed'}] : [])];
  return new Response(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
}
test('official SAM parser decodes documented geometry and mask into an overlay', async()=> {
  const [object]=await decodeSegmentation(samStream(sample),{width:320,height:334});
  assert.deepEqual(object.box,{x1:211,y1:228,x2:270,y2:254}); assert.equal(object.mask.width,60); assert.equal(object.mask.height,27); assert.match(object.mask.path,/^M/);
});
test('SAM empty result succeeds, incomplete and mismatched geometry fail', async()=> {
  assert.deepEqual(await decodeSegmentation(samStream(''),{width:320,height:334}),[]);
  await assert.rejects(decodeSegmentation(samStream(sample,false),{width:320,height:334}));
  await assert.rejects(decodeSegmentation(samStream(sample),{width:960,height:960}));
  await assert.rejects(decodeSegmentation(samStream(sample.replace('<0f>','<1f>')),{width:320,height:334}));
});
test('SAM allocation limits apply before official decoder allocates a raster', async()=> {
  await assert.rejects(decodeSegmentation(samStream(sample.replace('data=27,60,','data=100000,100000,')),{width:320,height:334}),error=>error.code==='SAM_RESPONSE_TOO_LARGE');
});
