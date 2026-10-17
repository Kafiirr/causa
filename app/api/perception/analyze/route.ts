import { env } from 'cloudflare:workers';
import { handlePerception } from '../../../../server/perception.mjs';

export function POST(request: Request) { return handlePerception(request, env); }
