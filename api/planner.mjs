import { handlePlanner } from '../server/planner.mjs';
import { withVercelAccess } from '../server/vercel-access.mjs';
const handle = withVercelAccess(handlePlanner);
export default { fetch: request => handle(request) };
