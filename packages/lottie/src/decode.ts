import { Gunzip } from 'fflate';

export const MAX_LOTTIE_INPUT_BYTES = 12 * 1024 * 1024;
export const MAX_TGS_COMPRESSED_BYTES = 2 * 1024 * 1024;
export const MAX_TGS_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;

export function decodeLottieJson(input: Uint8Array, fileName = 'animation.json'): string {
  const lowerName = fileName.toLowerCase();
  const isTgs = lowerName.endsWith('.tgs');
  const isGzip = input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b;

  if (input.length === 0) throw new Error(`${fileName} is empty`);
  if (isTgs && input.length > MAX_TGS_COMPRESSED_BYTES) {
    throw new Error(`TGS files must be no larger than ${formatBytes(MAX_TGS_COMPRESSED_BYTES)}`);
  }
  if (!isTgs && input.length > MAX_LOTTIE_INPUT_BYTES) {
    throw new Error(`Lottie JSON files must be no larger than ${formatBytes(MAX_LOTTIE_INPUT_BYTES)}`);
  }
  if (isTgs && !isGzip) throw new Error(`${fileName} is not a gzip-compressed TGS file`);

  let bytes = input;
  if (isGzip) bytes = gunzipBounded(input, MAX_TGS_UNCOMPRESSED_BYTES, fileName);
  else if (bytes.length > MAX_TGS_UNCOMPRESSED_BYTES) {
    throw new Error(`Decoded Lottie data must be no larger than ${formatBytes(MAX_TGS_UNCOMPRESSED_BYTES)}`);
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${fileName} is not valid UTF-8`);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function gunzipBounded(input: Uint8Array, limit: number, fileName: string): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let exceeded = false;
  let finished = false;
  const gunzip = new Gunzip((chunk, final) => {
    if (size + chunk.length > limit) {
      exceeded = true;
      return;
    }
    chunks.push(chunk);
    size += chunk.length;
    finished ||= final;
  });

  try {
    // Small input chunks let us stop decompression as soon as the output cap is reached.
    for (let offset = 0; offset < input.length; offset += 1024) {
      const end = Math.min(input.length, offset + 1024);
      gunzip.push(input.subarray(offset, end), end === input.length);
      if (exceeded) throw new Error(`Decoded TGS data must be no larger than ${formatBytes(limit)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Decoded TGS data')) throw error;
    throw new Error(`${fileName} is not a valid gzip-compressed TGS file`);
  }
  if (!finished) throw new Error(`${fileName} is incomplete or not a valid gzip-compressed TGS file`);

  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
