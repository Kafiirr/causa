// Match the gateway limits without discarding detail from ordinary camera images.
export function frameSize(width, height) {
  if (![width,height].every(v=>Number.isFinite(v)&&v>=1)) throw new Error('Invalid image dimensions.');
  const scale=Math.min(1,1920/Math.max(width,height),Math.sqrt(2_100_000/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export function encodeFrame(canvas) {
  for(const quality of [.92,.85,.75,.6,.45]) {
    const image=canvas.toDataURL('image/jpeg',quality),base64=image.split(',')[1] || '';
    const bytes=base64.length*3/4-(base64.endsWith('==')?2:base64.endsWith('=')?1:0);
    if(base64 && bytes<=1_800_000)return image;
  }
  throw new Error('Image exceeds the analysis size limit. Use a smaller image.');
}
export function proposalRegion(component, box, frame) {
  if(!box || !['x1','y1','x2','y2'].every(k=>Number.isFinite(box[k])))return null;
  const pad=Math.max(8,Math.round(Math.max(box.x2-box.x1+1,box.y2-box.y1+1)*.12));
  const x=Math.max(0,Math.floor(box.x1-pad)),y=Math.max(0,Math.floor(box.y1-pad));
  const right=Math.min(frame.width,Math.ceil(box.x2+1+pad)),bottom=Math.min(frame.height,Math.ceil(box.y2+1+pad));
  if(right-x<16 || bottom-y<16)return null;
  return {component,x,y,width:right-x,height:bottom-y,selectionMethod:'muse_proposal'};
}
