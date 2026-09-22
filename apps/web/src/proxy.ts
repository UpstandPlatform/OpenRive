// Optional access protection for self-hosting.
// Locally nothing changes: there is no login. When OPENRIVE_ACCESS_TOKEN is
// set (e.g. on a server reachable by others), every request needs HTTP Basic
// auth with that token as the password (any user name).
import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function proxy(request: NextRequest) {
  const token = process.env.OPENRIVE_ACCESS_TOKEN || process.env.RIVE_EDITOR_ACCESS_TOKEN;
  // the health check reveals nothing and must work for container probes
  if (!token || request.nextUrl.pathname === '/api/health') return NextResponse.next();
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    if (safeEqual(password, token)) return NextResponse.next();
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="OpenRive", charset="UTF-8"' },
  });
}
