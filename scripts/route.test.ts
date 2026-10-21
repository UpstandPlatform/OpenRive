import { apiKeyVerificationFailure, body, requireSameOrigin } from '../apps/web/src/lib/server/route';
import { proxy } from '../apps/web/src/proxy';
import { NextRequest } from 'next/server';
import { z } from 'zod';

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`Route origin test failed: ${message}`);
}

const saved = {
  OPENRIVE_URL: process.env.OPENRIVE_URL,
  OPENRIVE_TRUSTED_ORIGINS: process.env.OPENRIVE_TRUSTED_ORIGINS,
  OPENRIVE_ACCESS_TOKEN: process.env.OPENRIVE_ACCESS_TOKEN,
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
  check(apiKeyVerificationFailure('RATE_LIMITED')?.status === 429, 'temporary MCP API key rate limits must return 429, not an authentication failure');
  const throttled = apiKeyVerificationFailure({ code: 'RATE_LIMITED', details: { tryAgainIn: 1_500 } });
  check(throttled?.status === 429 && throttled.headers.get('retry-after') === '2', 'MCP throttling must carry a precise Retry-After header');
  check((await throttled?.json() as { code?: string })?.code === 'MCP_API_KEY_RATE_LIMITED', 'throttling must have a stable machine-readable error code');
  check(apiKeyVerificationFailure('USAGE_EXCEEDED')?.status === 429, 'exhausted MCP API key usage must return 429');
  const expired = apiKeyVerificationFailure('KEY_EXPIRED');
  check(expired?.status === 401 && expired.headers.has('www-authenticate'), 'expired API keys must clearly identify an invalid bearer credential');
  check((await expired?.json() as { code?: string })?.code === 'MCP_API_KEY_EXPIRED', 'expired API keys must expose a precise error code');

  process.env.OPENRIVE_ACCESS_TOKEN = 'shared-server-password';
  const bearerMcp = proxy(new NextRequest('https://openrive.example.com/api/mcp', { headers: { authorization: 'Bearer openrive_mcp_test' } }));
  check(bearerMcp.status === 200, 'MCP bearer credentials must reach the endpoint verifier even when the shared Basic password is enabled');
  const protectedPage = proxy(new NextRequest('https://openrive.example.com/editor/project'));
  check(protectedPage.status === 401, 'the shared Basic password must still protect non-MCP routes');
  console.log('Route origin and body-limit checks passed');
} finally {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name as keyof typeof saved];
    else process.env[name as keyof typeof saved] = value;
  }
}
