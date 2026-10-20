import { COMPONENTS } from '../public/perception-contract.js';

const area = b => (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1);
const intersection = (a,b) => Math.max(0,Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1)+1) * Math.max(0,Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1)+1);

export function groundedBox(claim, frame, usable) {
  if (!usable || !['visible','partial'].includes(claim.visibility) || !(claim.regions?.length || claim.box.length === 4) || claim.identityBasis === 'unknown') return null;
  // A generic valve's position alone cannot establish MAIN/BYPASS identity.
  if (claim.component.endsWith('_valve') && !['readable_label','scene_label'].includes(claim.identityBasis)) return null;
  const convert = values => {
    const [left,top,right,bottom] = values;
    const box = {x1:Math.floor(left*frame.width/1000),y1:Math.floor(top*frame.height/1000),x2:Math.min(frame.width-1,Math.ceil(right*frame.width/1000)-1),y2:Math.min(frame.height-1,Math.ceil(bottom*frame.height/1000)-1)};
    if (box.x2 < box.x1 || box.y2 < box.y1) return null;
    if (frame.focus?.component === claim.component) {
      const f=frame.focus, roi={x1:f.x,y1:f.y,x2:f.x+f.width-1,y2:f.y+f.height-1};
      if (intersection(box,roi)/area(box)<0.8) return null;
    }
    return box;
  };
  const proposals = claim.component === 'tube' && claim.regions?.length ? claim.regions : [claim.box];
  const boxes = [...new Map(proposals.filter(b=>b.length===4).map(convert).filter(Boolean).map(b=>[JSON.stringify(b),b])).values()];
  if (!boxes.length) return null;
  const handleBox = claim.component.endsWith('_valve') && claim.handleBox?.length===4 ? convert(claim.handleBox) : null;
  return {box:boxes[0],boxes,handleBox,source:'muse_candidate',basis:claim.identityBasis,evidence:claim.identityEvidence};
}

const containsCenter = (box,object) => {
  const x=(object.x1+object.x2)/2,y=(object.y1+object.y2)/2;
  return x>=box.x1-.5 && x<=box.x2+.5 && y>=box.y1-.5 && y<=box.y2+.5;
};
const supports = (box,object) => containsCenter(box,object) && intersection(box,object)/area(object)>=0.65;
// Union of clipped rectangles: overlapping proposals must not count area twice,
// and empty space between disconnected tube sections must not become support.
function unionOverlap(boxes,object) {
  const clips=boxes.map(b=>({x1:Math.max(b.x1,object.x1),y1:Math.max(b.y1,object.y1),x2:Math.min(b.x2,object.x2),y2:Math.min(b.y2,object.y2)})).filter(b=>b.x2>=b.x1&&b.y2>=b.y1);
  const xs=[...new Set(clips.flatMap(b=>[b.x1,b.x2+1]))].sort((a,b)=>a-b);let total=0;
  for(let i=1;i<xs.length;i++){
    const ys=clips.filter(b=>b.x1<xs[i]&&b.x2+1>xs[i-1]).map(b=>[b.y1,b.y2+1]).sort((a,b)=>a[0]-b[0]);
    let end=-Infinity,length=0;
    for(const [a,b] of ys){length+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}
    total+=(xs[i]-xs[i-1])*length;
  }
  return total;
}
function matchingBasis(claim,object) {
  const boxes=claim.grounding.boxes || [claim.grounding.box];
  if(boxes.some(box=>supports(box,object)))return 'muse_box_overlap';
  if(claim.component.endsWith('_valve') && claim.grounding.handleBox && supports(claim.grounding.handleBox,object))return 'muse_handle_overlap';
  if(claim.component==='tube' && boxes.some(b=>containsCenter(b,object)) && unionOverlap(boxes,object)/area(object)>=.65)return 'muse_section_union_overlap';
  if(claim.component.endsWith('_valve')){
    const box=claim.grounding.box;
    // Small valve parts may straddle an approximate proposal edge. Require
    // existing overlap, a small part, and a tightly bounded expansion.
    const pad=.15*Math.min(box.x2-box.x1+1,box.y2-box.y1+1);
    const nearby={x1:box.x1-pad,y1:box.y1-pad,x2:box.x2+pad,y2:box.y2+pad};
    if(area(object)<=area(box)*.5 && intersection(box,object)>0 && supports(nearby,object))return 'muse_box_edge_candidate';
  }
  return null;
}

export function mergeConceptObjects(detections) {
  const objects=[];
  for(const detection of detections){
    for(const object of detection.objects){
      const duplicate=objects.find(o=>intersection(o.box,object.box)/(area(o.box)+area(object.box)-intersection(o.box,object.box))>=.85);
      if(duplicate){duplicate.sourcePrompts=[...new Set([...duplicate.sourcePrompts,detection.prompt])];continue;}
      objects.push({...object,objectId:`${detection.prompt}:${object.objectId}`,sourcePrompts:[detection.prompt]});
    }
  }
  return objects;
}
export function proposalCoverage(claim, objects) {
  const boxes=claim?.grounding?.boxes || (claim?.grounding ? [claim.grounding.box] : []);
  return {proposed:boxes.length,supported:boxes.filter(box=>objects.some(o=>supports(box,o.box))).length,completeComponentVerified:false};
}

export function associateRegions(objects, claims, prompt) {
  const candidates=claims.filter(c=>COMPONENTS[c.component]===prompt && c.grounding);
  const assigned=new Map(), unresolved=[];
  for(const object of objects){
    const matches=candidates.filter(c=>matchingBasis(c,object.box));
    if(matches.length!==1){unresolved.push({...object,reason:matches.length?'competing_component_boxes':'no_supported_component_box'});continue;}
    const claim=matches[0], component=claim.component;
    const handle=claim.grounding.handleBox;
    const extent=matchingBasis(claim,object.box)==='muse_box_edge_candidate' ? 'likely_partial_component' : handle && intersection(handle,object.box)/area(object.box)>=0.8 ? 'likely_handle_only' : component.endsWith('_valve') && area(object.box)/area(claim.grounding.box)<0.5 ? 'likely_partial_component' : 'not_verified';
    assigned.set(component,[...(assigned.get(component)||[]),{...object,association:matchingBasis(claim,object.box),extent}]);
  }
  // Two valve instances must never acquire the same role merely from a wide box.
  for(const [component,matches] of assigned){
    if(component.endsWith('_valve') && matches.length>1){
      unresolved.push(...matches.map(o=>({...o,reason:'multiple_valves_for_one_role'})));assigned.delete(component);
    }
  }
  return {assigned,unresolved};
}
