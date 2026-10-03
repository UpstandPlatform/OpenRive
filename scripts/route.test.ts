import { requireSameOrigin } from '../apps/web/src/lib/server/route';

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
          origin: 'https://openrive.example.com',
          host: 'openrive.example.com',
          'x-forwarded-proto': 'https',
        }),
      ),
    )) === 200,
    'forwarded HTTPS metadata must provide a local fallback origin',
  );
  check(
    (await status(requireSameOrigin(request('https://openrive.example.com/api/mcp/keys', { 'sec-fetch-site': 'cross-site' })))) === 403,
    'cross-site requests without an Origin header must be rejected',
  );
  console.log('Route origin checks passed');
} finally {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name as keyof typeof saved];
    else process.env[name as keyof typeof saved] = value;
  }
}
