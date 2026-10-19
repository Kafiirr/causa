export const COMPONENTS = Object.freeze({ reservoir: 'water container', pump: 'pump', main_valve: 'valve', bypass_valve: 'valve', tube: 'plastic tube', outlet: 'transparent container' });
export const LABELS = Object.freeze({ reservoir: 'Reservoir', pump: 'Pump', main_valve: 'Main valve', bypass_valve: 'Bypass valve', tube: 'Tubing', outlet: 'Outlet container' });
export const TARGETS = Object.freeze({ scene: null, valve: 'main_valve', bypass: 'bypass_valve', pump: 'pump', reservoir: 'reservoir', tube: 'tube', outlet: 'outlet' });
export const VISIBILITY = Object.freeze(['visible', 'partial', 'not_visible', 'unknown']);
export const ORIENTATION = Object.freeze(['parallel', 'perpendicular', 'oblique', 'unknown']);

export function regionKey(focus) {
  return focus ? JSON.stringify([focus.component, focus.x, focus.y, focus.width, focus.height]) : 'full_frame';
}

export function validRegion(focus, frame, task) {
  return Boolean(focus && Object.hasOwn(COMPONENTS, focus.component) &&
    (!TARGETS[task] || focus.component === TARGETS[task]) &&
    ['x','y','width','height'].every(k => Number.isInteger(focus[k])) &&
    focus.x >= 0 && focus.y >= 0 && focus.width >= 16 && focus.height >= 16 &&
    focus.x + focus.width <= frame.width && focus.y + focus.height <= frame.height);
}

export function segmentationTargets(assessment, task, focus) {
  if (focus) return [focus.component];
  if (TARGETS[task]) return [TARGETS[task]];
  return assessment.usable ? Object.keys(COMPONENTS) : [];
}

export function toSourceObjects(objects, focus) {
  if (!focus) return objects;
  return objects.map(object => ({ ...object, box: { x1: object.box.x1 + focus.x, y1: object.box.y1 + focus.y, x2: object.box.x2 + focus.x, y2: object.box.y2 + focus.y } }));
}

export const taskForComponent = component => Object.keys(TARGETS).find(task => TARGETS[task] === component) || 'scene';

// Compare only repeated observations of identical bytes and analysis scope.
export function conflictingClaims(analyses, current, component) {
  const comparable = analyses.filter(a => a.frame.sha256 === current.frame.sha256 && a.task === current.task && regionKey(a.focus) === regionKey(current.focus));
  return ['visibility','orientation'].filter(key => new Set(comparable.map(a => a.assessment.components.find(c => c.component === component)?.[key]).filter(v => v && v !== 'unknown')).size > 1);
}
