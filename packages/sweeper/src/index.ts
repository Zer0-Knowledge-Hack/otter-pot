import { Env } from './config';
import { runSweep, logSweepResult, sweepResultToJson } from './runner';
import { authorizeManualTrigger } from './auth';

async function handleManualSweep(env: Env): Promise<Response> {
  try {
    const result = await runSweep(env);
    logSweepResult(result);
    return new Response(JSON.stringify(sweepResultToJson(result)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    console.error(`[Sweeper] Error during manual sweep:`, e?.stack || e?.message || e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || String(e) }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Sweeper] Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);

    try {
      const result = await runSweep(env);
      logSweepResult(result);
    } catch (e: any) {
      console.error(`[Sweeper] Fatal error during scheduled execution:`, e.message || e);
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__health' && request.method === 'GET') {
      return new Response('ok', { status: 200 });
    }

    if (url.pathname === '/sweep') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      if (!authorizeManualTrigger(request, env)) {
        return new Response('Unauthorized', { status: 401 });
      }
      return handleManualSweep(env);
    }

    return new Response('Not found', { status: 404 });
  },
};