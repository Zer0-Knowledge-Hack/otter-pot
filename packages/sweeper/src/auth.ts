import { Env } from './config';

export function authorizeManualTrigger(request: Request, env: Env): boolean {
  const expected = env.MANUAL_TRIGGER_TOKEN;
  if (!expected) {
    return false;
  }

  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ??
    request.headers.get('x-sweep-token')?.trim();

  if (!provided) {
    return false;
  }

  return timingSafeEqualStrings(provided, expected);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}