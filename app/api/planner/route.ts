import { env } from 'cloudflare:workers';
import { handlePlanner } from '../../../server/planner.mjs';
export function GET(request: Request) { return handlePlanner(request, env); }
export function POST(request: Request) { return handlePlanner(request, env); }
