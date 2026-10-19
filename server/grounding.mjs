import { COMPONENTS } from '../public/perception-contract.js';

const area = b => (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1);
const intersection = (a,b) => Math.max(0,Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1)+1) * Math.max(0,Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1)+1);

export function groundedBox(claim, frame, usable) {
  if (!usable || !['visible','partial'].includes(claim.visibility) || claim.box.length !== 4 || claim.identityBasis === 'unknown') return null;
  // A generic valve's position alone cannot establish MAIN/BYPASS identity.
  if (claim.component.endsWith('_valve') && claim.identityBasis !== 'readable_label') return null;
  const [left,top,right,bottom] = claim.box;
  const box = {x1:Math.floor(left*frame.width/1000),y1:Math.floor(top*frame.height/1000),x2:Math.min(frame.width-1,Math.ceil(right*frame.width/1000)-1),y2:Math.min(frame.height-1,Math.ceil(bottom*frame.height/1000)-1)};
  if (box.x2 < box.x1 || box.y2 < box.y1) return null;
  if (frame.focus?.component === claim.component) {
    const f=frame.focus, roi={x1:f.x,y1:f.y,x2:f.x+f.width-1,y2:f.y+f.height-1};
    if (intersection(box,roi)/area(box)<0.8) return null;
  }
  return {box,source:'muse_candidate',basis:claim.identityBasis,evidence:claim.identityEvidence};
}

export function associateRegions(objects, claims, prompt) {
  const candidates=claims.filter(c=>COMPONENTS[c.component]===prompt && c.grounding);
  const assigned=new Map(), unresolved=[];
  for(const object of objects){
    const center={x:(object.box.x1+object.box.x2)/2,y:(object.box.y1+object.box.y2)/2};
    const matches=candidates.filter(c=>{
      const box=c.grounding.box;
      return center.x>=box.x1 && center.x<=box.x2 && center.y>=box.y1 && center.y<=box.y2 && intersection(box,object.box)/area(object.box)>=0.65;
    });
    if(matches.length!==1){unresolved.push({...object,reason:matches.length?'competing_component_boxes':'no_supported_component_box'});continue;}
    const component=matches[0].component;
    assigned.set(component,[...(assigned.get(component)||[]),{...object,association:'muse_box_overlap',extent:'not_verified'}]);
  }
  // Two valve instances must never acquire the same role merely from a wide box.
  for(const [component,matches] of assigned){
    if(component.endsWith('_valve') && matches.length>1){
      unresolved.push(...matches.map(o=>({...o,reason:'multiple_valves_for_one_role'})));assigned.delete(component);
    }
  }
  return {assigned,unresolved};
}
