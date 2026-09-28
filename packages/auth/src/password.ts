// Password hashing with PBKDF2 through WebCrypto, which every runtime OpenRive
// targets provides (Bun, Node and the browser) — no native module to build.
//
// Stored form: pbkdf2$sha512$<iterations>$<salt base64>$<hash base64>
const ALGORITHM = 'pbkdf2';
const DIGEST = 'sha512';
/** the same digest, spelled the way WebCrypto wants it */
const WEBCRYPTO_DIGEST = 'SHA-512';
const ITERATIONS = 210_000; // OWASP's 2023 guidance for PBKDF2-HMAC-SHA512
const KEY_BYTES = 32;
const SALT_BYTES = 16;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: WEBCRYPTO_DIGEST }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return [ALGORITHM, DIGEST, ITERATIONS, toBase64(salt), toBase64(hash)].join('$');
}

/** Constant-time comparison, so a wrong password cannot be timed byte by byte. */
function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algorithm, digest, iterations, salt, hash] = stored.split('$');
  if (algorithm !== ALGORITHM || digest !== DIGEST || !iterations || !salt || !hash) return false;
  const candidate = await derive(password, fromBase64(salt), Number(iterations));
  return equals(candidate, fromBase64(hash));
}

/** Minimum requirements: long enough to matter, no other rules to work around. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters';
  if (password.length > 200) return 'That password is too long';
  return null;
}
