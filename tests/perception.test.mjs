import test from 'node:test';
import assert from 'node:assert/strict';
import { associateRegions, groundedBox } from '../server/grounding.mjs';
import { deflateSync } from 'node:zlib';
import { validateFrame, validateAssessment, createPerceptionHandler, decodeSegmentation, responseEvents } from '../server/perception.mjs';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const input = (extra = {}) => ({ caseId:'case1', frameId:'frame1', requestId:'request1', source:'camera', capturedAt:new Date().toISOString(), task:'valve', width:1, height:1, image, ...extra });
const observation = (extra = {}) => ({ summary:'Main valve visible', usable:true, limitations:['The image cannot establish flow.'], outcome:'open', reason:'The labeled main valve appears open.', components:[{component:'main_valve',observation:'Visible handle',visibility:'visible',orientation:'parallel',handleType:'lever',box:[0,0,1000,1000],identityBasis:'readable_label',identityEvidence:'03 MAIN VALVE'}], segment:['main_valve'], ...extra });
const spark = (value = observation()) => Response.json({ choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}], usage:{prompt_tokens:100,completion_tokens:50} });
const request = (body = input(), headers = {}) => new Request('https://causa.test/api/perception/analyze', { method:'POST', headers:{origin:'https://causa.test','content-type':'application/json','oai-authenticated-user-id':'owner',...headers}, body:JSON.stringify(body) });
const env = { MODEL_API_KEY:'test-key-not-real' };
const handler = options => createPerceptionHandler({ rateBuckets:new Map(), ...options });

test('two generic valve masks associate to distinct labeled boxes, never the requested role by default',()=>{
  const obj=(id,y)=>({objectId:id,box:{x1:40,y1:y,x2:60,y2:y+10},mask:{width:21,height:11,path:'M0 0Z'}});
  const claims=[{component:'main_valve',grounding:{box:{x1:30,y1:10,x2:70,y2:40}}},{component:'bypass_valve',grounding:{box:{x1:30,y1:60,x2:70,y2:90}}}];
  const result=associateRegions([obj('a',20),obj('b',70)],claims,'valve');
  assert.deepEqual(result.assigned.get('main_valve').map(o=>o.objectId),['a']);
  assert.deepEqual(result.assigned.get('bypass_valve').map(o=>o.objectId),['b']);
  // No boxes, competing boxes, or a single box spanning both valves must abstain.
  assert.equal(associateRegions([obj('a',20)],[],'valve').unresolved.length,1);
  assert.equal(associateRegions([obj('a',20)],[claims[0],{...claims[1],grounding:claims[0].grounding}],'valve').assigned.size,0);
  assert.equal(associateRegions([obj('a',20),obj('b',70)],[{...claims[0],grounding:{box:{x1:0,y1:0,x2:100,y2:100}}}],'valve').assigned.size,0);
});
test('T handles abstain on direction; unlabeled valves and out-of-crop boxes cannot ground a role',()=>{
  const claim={...observation().components[0],handleType:'t_handle',orientation:'perpendicular'};
  assert.equal(validateAssessment(observation({components:[claim]}),'valve').components[0].orientation,'unknown');
  assert.equal(groundedBox({...claim,identityBasis:'visual_context'},{width:100,height:100},true),null);
  assert.equal(groundedBox({...claim,box:[600,600,900,900]},{width:100,height:100,focus:{component:'main_valve',x:0,y:0,width:20,height:20}},true),null);
  assert.throws(()=>validateAssessment(observation({components:[{...claim,box:[500,100,200,300]}]}),'valve'));
});
test('full-scene coverage checks all six components with a single shared valve request',async()=>{
  const prompts=[];
  const gateway=handler({fetcher:async(url,options)=>{
    const payload=JSON.parse(options.body);
    if(url.endsWith('/chat/completions'))return spark(observation({segment:['reservoir']}));
    prompts.push(payload.input[0].content[0].text);return new Response('mock');
  },decode:async()=>[]});
  const result=await(await gateway(request(input({task:'scene'})),env)).json();
  assert.equal(result.segmentations.length,6);assert.equal(prompts.length,5);assert.equal(prompts.filter(p=>p==='valve').length,1);
  assert.equal(result.usage.modelCalls,6);
});

// Real small PNGs, including valid CRCs, for original/crop dimension checks.
function png(width, height) {
  function chunk(type, data) {
    const body=Buffer.concat([Buffer.from(type),data]); let crc=0xffffffff;
    for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const result=Buffer.alloc(body.length+8);result.writeUInt32BE(data.length);body.copy(result,4);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(height*(width*3+1)))),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}

test('focused tasks request their own SAM target despite unrelated Muse selections', async () => {
  for(const [task,component,prompt] of [['pump','pump','pump'],['valve','main_valve','valve'],['bypass','bypass_valve','valve']]){
    const calls=[];
    const gateway=handler({fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return url.endsWith('/chat/completions')?spark(observation({segment:['reservoir','tube']})):new Response('mock');},decode:async()=>[]});
    const result=await(await gateway(request(input({task})),env)).json();
    assert.equal(calls.length,2);assert.equal(calls[1].input[0].content[0].text,prompt);
    assert.equal(result.target,component);assert.deepEqual(result.segmentations.map(s=>s.component),[component]);
    assert.equal(result.segmentations[0].identity,'unverified');assert.equal(result.assessment.outcome,'unknown');
  }
});
test('appearance never establishes physical state, and invalid component claims fail closed',()=>{
  const result=validateAssessment(observation(),'valve');
  assert.equal(result.components[0].orientation,'parallel');
  assert.deepEqual(result.claims,{valveState:'unknown',pumpOperation:'unknown',flow:'unknown'});
  assert.equal(validateAssessment(observation({components:[{component:'pump',observation:'Black housing',visibility:'visible',orientation:'parallel',handleType:'lever',box:[0,0,1000,1000],identityBasis:'readable_label',identityEvidence:'03 MAIN VALVE'}]}),'pump').components[0].orientation,'unknown');
  for(const components of [[...observation().components,...observation().components],[{component:'pump',observation:'Pump'}]])assert.throws(()=>validateAssessment(observation({components}),'pump'));
});
test('crop binds its own bytes and dimensions, uses context, and maps masks to source pixels',async()=>{
  const focus={component:'pump',x:12,y:20,width:24,height:16,image:png(24,16)};
  const body=input({task:'pump',width:64,height:64,image:png(64,64),focus});
  const calls=[];
  const gateway=handler({fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return url.endsWith('/chat/completions')?spark(observation({components:[{...observation().components[0],component:'pump',box:[188,313,562,562]}]})):new Response('mock');},decode:async(_response,frame)=>{
    assert.equal(frame.width,24);assert.equal(frame.height,16);
    return [{objectId:'0',box:{x1:1,y1:2,x2:22,y2:14},mask:{width:22,height:13,path:'M0 0L22 0L22 13Z'}}];
  }});
  const response=await gateway(request(body),env);assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.schema,'causa.perception.v3');
  assert.equal(calls[0].messages[1].content[1].image_url.url,body.image);
  assert.equal(calls[0].messages[1].content[3].image_url.url,focus.image);
  assert.equal(calls[1].input[0].content[1].image_url,focus.image);
  assert.deepEqual(result.segmentations[0].objects[0].box,{x1:13,y1:22,x2:34,y2:34});
  assert.equal(result.segmentations[0].objects[0].mask.width,22);
  assert.equal(result.segmentations[0].coordinateSpace,'original_frame');
  assert.equal(result.segmentations[0].scope,'operator_region');assert.match(result.focus.sha256,/^[a-f0-9]{64}$/);
  assert.notEqual(result.focus.sha256,result.frame.sha256);assert.equal(result.focus.image,undefined);
  for(const patch of [{component:'main_valve'},{x:-1},{x:50},{y:0.5},{width:15},{image:png(32,16)}])await assert.rejects(validateFrame({...body,focus:{...focus,...patch}}));
});

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
  for (const task of ['valve','pump','bypass','scene']) assert.equal(validateAssessment(observation(),task).outcome,'unknown');
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
  assert.equal(calls[0].payload.reasoning_effort,'minimal'); assert.equal(calls[0].payload.max_tokens,4096);
  assert.equal(calls[1].url,'https://api.meta.ai/v1/responses'); assert.equal(calls[1].payload.model,'sam-3.1'); assert.equal(calls[1].payload.metadata.mask_encoding,'one_bit');
  assert.equal(calls[1].payload.input[0].content[0].text,'valve');
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
test('live-observed reasoning budget exhaustion is explicit and never starts SAM', async () => {
  let calls=0;
  const gateway=handler({fetcher:async()=>{calls++;return Response.json({choices:[{finish_reason:'length',message:{content:null}}],usage:{completion_tokens:1200,completion_tokens_details:{reasoning_tokens:1198}}});}});
  const response=await gateway(request(),env); assert.equal(response.status,502);
  assert.equal((await response.json()).error.code,'MODEL_OUTPUT_LIMIT'); assert.equal(calls,1);
});
test('concurrent rejections do not unlock the active analysis', async () => {
  let release; const waiting=new Promise(resolve => {release=resolve;}); let calls=0;
  const gateway=handler({fetcher:async () => {calls++; await waiting; return spark(observation({usable:false,segment:[]}));}});
  const first=gateway(request(input({task:'scene'})),env);
  while(calls===0) await new Promise(resolve => setTimeout(resolve,1));
  for(let i=0;i<2;i++) {const response=await gateway(request(),env); assert.equal(response.status,429); assert.equal((await response.json()).error.code,'ANALYSIS_IN_PROGRESS');}
  release(); assert.equal((await first).status,200); assert.equal(calls,1);
});
test('four-per-minute local rate limit and expiry', async () => {
  let now=Date.now(); const gateway=handler({clock:()=>now,fetcher:async()=>spark(observation({usable:false,segment:[]}))});
  for(let i=0;i<4;i++) assert.equal((await gateway(request(input({task:'scene'})),env)).status,200);
  assert.equal((await gateway(request(),env)).status,429); now+=61000;
  assert.equal((await gateway(request(input({task:'scene'})),env)).status,200);
});
test('body size guard rejects excess bytes before parsing or model calls', async () => {
  const response=await handler({fetcher:()=>assert.fail()})(request({large:'x'.repeat(5_000_000)}),env); assert.equal(response.status,413);
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
