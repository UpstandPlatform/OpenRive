// Passwords stored before OpenRive moved to Better Auth.
//
// Better Auth hashes with scrypt. Accounts created by the first version of
// sign-in carry a PBKDF2 hash instead, in the form
//
//   pbkdf2$sha512$<iterations>$<salt base64>$<hash base64>
//
// which this module verifies, so nobody is locked out by the change. Nothing
// writes this format any more; the next password change stores scrypt.
const ALGORITHM = 'pbkdf2';
const DIGEST = 'sha512';
/** the same digest, spelled the way WebCrypto wants it */
const WEBCRYPTO_DIGEST = 'SHA-512';
const KEY_BYTES = 32;

export const isLegacyHash = (hash: string) => hash.startsWith(`${ALGORITHM}$`);

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: WEBCRYPTO_DIGEST }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

/** Constant-time comparison, so a wrong password cannot be timed byte by byte. */
function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyLegacyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algorithm, digest, iterations, salt, hash] = stored.split('$');
  if (algorithm !== ALGORITHM || digest !== DIGEST || !iterations || !salt || !hash) return false;
  const candidate = await derive(password, fromBase64(salt), Number(iterations));
  return equals(candidate, fromBase64(hash));
}
