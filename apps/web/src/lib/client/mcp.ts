'use client';

import { api } from './session';

export interface McpApiKeyMetadata {
  id: string;
  name: string | null;
  start: string | null;
  expiresAt: string | null;
  createdAt: string;
  enabled: boolean;
}

export interface CreatedMcpApiKey extends McpApiKeyMetadata {
  /** The secret is returned only once, immediately after creation. */
  key: string;
}

interface McpApiKeyListResponse {
  apiKeys: McpApiKeyMetadata[];
}

export interface CreateMcpApiKeyInput {
  name: string;
  expiresIn: number;
}

export function listMcpApiKeys() {
  return api.json<McpApiKeyListResponse>('/api/mcp/keys');
}

export function createMcpApiKey(input: CreateMcpApiKeyInput) {
  return api.json<CreatedMcpApiKey>('/api/mcp/keys', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeMcpApiKey(keyId: string) {
  return api.json<{ success?: boolean }>('/api/mcp/keys', {
    method: 'DELETE',
    body: JSON.stringify({ keyId }),
  });
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Clipboard access is unavailable');
}
