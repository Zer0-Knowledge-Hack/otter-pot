import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDevVars(): Record<string, string> {
  const filePath = resolve(process.cwd(), '.dev.vars');
  const content = readFileSync(filePath, 'utf8');
  const vars: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

const vars = loadDevVars();
const url = vars.SWEEPER_URL;
const token = vars.MANUAL_TRIGGER_TOKEN;

if (!url) {
  console.error('[Sweeper] SWEEPER_URL not set in .dev.vars');
  process.exit(1);
}
if (!token) {
  console.error('[Sweeper] MANUAL_TRIGGER_TOKEN not set in .dev.vars');
  process.exit(1);
}

console.log(`[Sweeper] Triggering manual sweep at ${url}/sweep`);
const res = await fetch(`${url.replace(/\/$/, '')}/sweep`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
});

const body = await res.text();
console.log(`[Sweeper] Status: ${res.status}`);
console.log(body);

if (!res.ok) {
  process.exitCode = 1;
}