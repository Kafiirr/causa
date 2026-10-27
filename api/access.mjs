import { handleAccess } from '../server/vercel-access.mjs';
export default { fetch: request => handleAccess(request) };
