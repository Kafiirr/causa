import { handlePerception } from '../../server/perception.mjs';
import { withVercelAccess } from '../../server/vercel-access.mjs';
const handle = withVercelAccess(handlePerception);
export default { fetch: request => handle(request) };
