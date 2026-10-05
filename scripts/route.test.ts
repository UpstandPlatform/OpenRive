import { body, requireSameOrigin } from '../apps/web/src/lib/server/route';
import { z } from 'zod';

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`Route origin test failed: ${message}`);
}

const saved = {
  OPENRIVE_URL: process.env.OPENRIVE_URL,
  OPENRIVE_TRUSTED_ORIGINS: process.env.OPENRIVE_TRUSTED_ORIGINS,
};

const request = (url: string, headers: Record<string, string>) => new Request(url, { headers });
const status = async (response: Response | null) => response?.status ?? 200;

try {
  process.env.OPENRIVE_URL = 'https://openrive.example.com';
  delete process.env.OPENRIVE_TRUSTED_ORIGINS;
  check(
    (await status(requireSameOrigin(request('http://openrive:3000/api/mcp/keys', { origin: 'https://openrive.example.com' })))) === 200,
    'configured public origin must work through an internal HTTP upstream',
  );
  check(
    (await status(requireSameOrigin(request('https://openrive.example.com/api/mcp/keys', { origin: 'https://attacker.example' })))) === 403,
    'an unrelated origin must be rejected',
  );

  delete process.env.OPENRIVE_URL;
  process.env.OPENRIVE_TRUSTED_ORIGINS = 'https://openrive.example.com, https://admin.example.com';
  check(
    (await status(requireSameOrigin(request('http://openrive:3000/api/mcp/keys', { origin: 'https://admin.example.com' })))) === 200,
    'an explicitly trusted origin must work through a proxy',
  );
  check(
    (await status(requireSameOrigin(request('http://openrive:3000/api/mcp/keys', { origin: 'https://attacker.example' })))) === 403,
    'a non-trusted origin must be rejected when trusted origins are configured',
  );

  delete process.env.OPENRIVE_TRUSTED_ORIGINS;
  check(
    (await status(
      requireSameOrigin(
        request('http://openrive:3000/api/mcp/keys', {
          origin: 'https://attacker.example',
          'x-forwarded-host': 'openrive.example.com',
          'x-forwarded-proto': 'https',
        }),
      ),
    )) === 403,
    'client-supplied forwarded headers must not widen the allowed origin',
  );
  check((await status(requireSameOrigin(request('http://openrive:3000/api/mcp/keys', {})))) === 200, 'same-origin requests without Origin remain allowed');
  check(
    (await status(requireSameOrigin(request('https://openrive.example.com/api/mcp/keys', { 'sec-fetch-site': 'cross-site' })))) === 403,
    'cross-site requests without an Origin header must be rejected',
  );
  const tooLarge = await body(new Request('http://openrive:3000/api/projects', { method: 'POST', body: '{"x":1}' }), z.object({}), 4);
  check(tooLarge.error?.status === 413, 'bounded JSON bodies must return 413 before parsing');
  console.log('Route origin and body-limit checks passed');
} finally {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name as keyof typeof saved];
    else process.env[name as keyof typeof saved] = value;
  }
}
