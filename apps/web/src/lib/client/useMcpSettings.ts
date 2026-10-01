'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  copyText,
  createMcpApiKey,
  listMcpApiKeys,
  revokeMcpApiKey,
  type McpApiKeyMetadata,
} from './mcp';

export type CopyTarget = 'endpoint' | 'secret' | null;

export interface McpSettingsController {
  keys: McpApiKeyMetadata[];
  loading: boolean;
  creating: boolean;
  revokingId: string | null;
  error: string | null;
  secret: string | null;
  copied: CopyTarget;
  name: string;
  expiresIn: number;
  setName(name: string): void;
  setExpiresIn(expiresIn: number): void;
  reload(): Promise<void>;
  create(): Promise<void>;
  revoke(key: McpApiKeyMetadata): Promise<void>;
  copy(value: string, target: Exclude<CopyTarget, null>): Promise<void>;
  dismissSecret(): void;
  clearError(): void;
}

const DEFAULT_EXPIRY = 90 * 24 * 60 * 60;
const COPY_FEEDBACK_MS = 1600;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useMcpSettings(enabled: boolean): McpSettingsController {
  const [keys, setKeys] = useState<McpApiKeyMetadata[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [name, setName] = useState('OpenRive MCP');
  const [expiresIn, setExpiresIn] = useState(DEFAULT_EXPIRY);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listMcpApiKeys();
      setKeys(result.apiKeys);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not load MCP API keys'));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
      return listMcpApiKeys()
        .then((result) => {
          if (active) setKeys(result.apiKeys);
        })
        .catch((cause) => {
          if (active) setError(errorMessage(cause, 'Could not load MCP API keys'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const create = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give this key a name so you can recognize it later');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createMcpApiKey({ name: trimmedName, expiresIn });
      const { key, ...metadata } = created;
      setKeys((current) => [metadata, ...current]);
      setSecret(key);
      setName('OpenRive MCP');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not create the MCP API key'));
    } finally {
      setCreating(false);
    }
  }, [expiresIn, name]);

  const revoke = useCallback(async (key: McpApiKeyMetadata) => {
    setRevokingId(key.id);
    setError(null);
    try {
      await revokeMcpApiKey(key.id);
      setKeys((current) => current.filter((item) => item.id !== key.id));
    } catch (cause) {
      setError(errorMessage(cause, 'Could not revoke the MCP API key'));
    } finally {
      setRevokingId(null);
    }
  }, []);

  const copy = useCallback(async (value: string, target: Exclude<CopyTarget, null>) => {
    try {
      await copyText(value);
      setCopied(target);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not copy to the clipboard'));
    }
  }, []);

  return {
    keys,
    loading,
    creating,
    revokingId,
    error,
    secret,
    copied,
    name,
    expiresIn,
    setName,
    setExpiresIn,
    reload,
    create,
    revoke,
    copy,
    dismissSecret: () => setSecret(null),
    clearError: () => setError(null),
  };
}
