import test from 'node:test';
import assert from 'node:assert/strict';
import {frameSize,encodeFrame,proposalRegion} from '../public/frame-preparation.js';

test('ordinary high-detail frames stay intact; large and square images meet gateway bounds',()=>{
  assert.deepEqual(frameSize(1680,1050),{width:1680,height:1050});
  assert.deepEqual(frameSize(320,240),{width:320,height:240});
  for(const [w,h] of [[8000,6000],[4000,4000],[1000,9000],[1,5000]]){
    const size=frameSize(w,h);assert.ok(size.width<=1920&&size.height<=1920);assert.ok(size.width*size.height<=2_100_000);
  }
  assert.throws(()=>frameSize(0,100));
});
test('encoding reduces quality only when required and never returns an oversized image',()=>{
  const qualities=[];
  const image=encodeFrame({toDataURL:(_mime,q)=>{qualities.push(q);return 'data:image/jpeg;base64,'+(q>.85?'A'.repeat(2_400_004):'AAAA');}});
  assert.deepEqual(qualities,[.92,.85]);assert.equal(image,'data:image/jpeg;base64,AAAA');
  assert.throws(()=>encodeFrame({toDataURL:()=> 'data:image/jpeg;base64,'+'A'.repeat(2_400_004)}),/size limit/);
});
test('proposal crops add context, stay inside the source frame, and retain selection provenance',()=>{
  const region=proposalRegion('pump',{x1:0,y1:5,x2:99,y2:99},{width:120,height:110});
  assert.deepEqual(region,{component:'pump',x:0,y:0,width:112,height:110,selectionMethod:'muse_proposal'});
  assert.equal(proposalRegion('pump',{x1:NaN,y1:0,x2:30,y2:30},{width:100,height:100}),null);
});
