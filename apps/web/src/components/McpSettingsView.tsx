'use client';

import { Bot, Check, Clipboard, KeyRound, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import type { CopyTarget } from '@/lib/client/useMcpSettings';
import type { McpApiKeyMetadata } from '@/lib/client/mcp';

export type McpConnectionMode = 'desktop' | 'remote' | 'local';

export interface McpSettingsViewProps {
  mode: McpConnectionMode;
  endpoint: string;
  keys: McpApiKeyMetadata[];
  loading: boolean;
  creating: boolean;
  revokingId: string | null;
  error: string | null;
  secret: string | null;
  copied: CopyTarget;
  name: string;
  expiresIn: number;
  onNameChange(name: string): void;
  onExpiryChange(expiresIn: number): void;
  onCreate(): void;
  onReload(): void;
  onRevoke(key: McpApiKeyMetadata): void;
  onCopy(value: string, target: Exclude<CopyTarget, null>): void;
  onDismissSecret(): void;
  onClearError(): void;
}

const expiryOptions = [
  { value: 30 * 24 * 60 * 60, label: '30 days' },
  { value: 90 * 24 * 60 * 60, label: '90 days' },
  { value: 365 * 24 * 60 * 60, label: '1 year' },
];

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function modeCopy(mode: McpConnectionMode) {
  if (mode === 'desktop') {
    return {
      title: 'Connect your AI tools',
      description: 'This desktop app exposes MCP on your private loopback connection. AI tools on this computer can connect without an API key.',
      note: 'Keep this endpoint local. It is only available while OpenRive is running.',
    };
  }
  if (mode === 'remote') {
    return {
      title: 'Connect your AI tools',
      description: 'Use the MCP endpoint with a user-scoped API key from Claude, Cursor, or another MCP-compatible client.',
      note: 'API keys are shown only once when created. Store them in your AI tool’s secret manager.',
    };
  }
  return {
    title: 'Connect your AI tools',
    description: 'This local browser session does not need a remote API key. Use the OpenRive CLI’s stdio MCP server for local automation.',
    note: 'For a desktop connection, open this page in the OpenRive desktop app.',
  };
}

function CopyButton({ value, target, copied, onCopy }: { value: string; target: Exclude<CopyTarget, null>; copied: CopyTarget; onCopy: McpSettingsViewProps['onCopy'] }) {
  const isCopied = copied === target;
  return (
    <button className="btn shrink-0" onClick={() => onCopy(value, target)} aria-label={isCopied ? 'Copied' : 'Copy to clipboard'}>
      {isCopied ? <Check size={14} /> : <Clipboard size={14} />}
      {isCopied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function McpSettingsView({
  mode,
  endpoint,
  keys,
  loading,
  creating,
  revokingId,
  error,
  secret,
  copied,
  name,
  expiresIn,
  onNameChange,
  onExpiryChange,
  onCreate,
  onReload,
  onRevoke,
  onCopy,
  onDismissSecret,
  onClearError,
}: McpSettingsViewProps) {
  const copy = modeCopy(mode);
  const canManageKeys = mode === 'remote';

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex-1 max-w-[1000px] w-full mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-[20px] font-semibold">AI &amp; API</h1>
          <p className="text-t2 mt-2 max-w-[680px]">Connect OpenRive to AI tools through the same editing API used by the editor and CLI.</p>
        </div>

        {error && (
          <div className="mb-5 px-3 py-2 rounded-md bg-[#3a1f1f] text-[#ffb4b4] flex items-center gap-3" role="alert">
            <span className="flex-1">{error}</span>
            <button className="text-t1 shrink-0" onClick={onClearError}>Dismiss</button>
          </div>
        )}

        <section className="bg-bg1 border border-line rounded-xl overflow-hidden mb-5" aria-labelledby="mcp-connection-heading">
          <div className="p-5 border-b border-line flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#18334b] text-accent flex items-center justify-center shrink-0"><Bot size={18} /></div>
            <div className="min-w-0">
              <h2 id="mcp-connection-heading" className="text-[15px] font-semibold">{copy.title}</h2>
              <p className="text-t2 mt-1 max-w-[680px]">{copy.description}</p>
            </div>
          </div>
          <div className="p-5">
            <label className="label block mb-2" htmlFor="mcp-endpoint">MCP endpoint</label>
            <div className="flex gap-2 items-center">
              <code id="mcp-endpoint" className="field h-8 flex items-center overflow-x-auto whitespace-nowrap selectable text-t1">{endpoint}</code>
              <CopyButton value={endpoint} target="endpoint" copied={copied} onCopy={onCopy} />
            </div>
            <p className="text-t3 text-[11px] mt-2">{copy.note}</p>
          </div>
        </section>

        {secret && (
          <section className="bg-[#203b33] border border-[#2c735e] rounded-xl p-5 mb-5" aria-labelledby="new-key-heading">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="text-ok mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 id="new-key-heading" className="font-semibold">Your new API key is ready</h2>
                <p className="text-t1 mt-1">Copy it now. OpenRive cannot show this secret again after you dismiss this message.</p>
                <div className="flex gap-2 items-center mt-3">
                  <code className="field h-8 flex items-center overflow-x-auto whitespace-nowrap selectable bg-[#162a25]">{secret}</code>
                  <CopyButton value={secret} target="secret" copied={copied} onCopy={onCopy} />
                </div>
              </div>
              <button className="icon-btn" onClick={onDismissSecret} aria-label="Dismiss new API key"><span aria-hidden>×</span></button>
            </div>
          </section>
        )}

        {canManageKeys ? (
          <section className="bg-bg1 border border-line rounded-xl overflow-hidden" aria-labelledby="api-keys-heading">
            <div className="p-5 border-b border-line flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#3d3520] text-key flex items-center justify-center shrink-0"><KeyRound size={18} /></div>
              <div className="min-w-0 flex-1">
                <h2 id="api-keys-heading" className="text-[15px] font-semibold">MCP API keys</h2>
                <p className="text-t2 mt-1">Create a separate key for each AI tool or workflow. Revoke a key immediately if it is no longer trusted.</p>
              </div>
              <button className="icon-btn" onClick={onReload} disabled={loading} aria-label="Refresh API keys" title="Refresh API keys">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="p-5 border-b border-line bg-bg2/40">
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_150px_auto] gap-2 items-end">
                <label className="min-w-0">
                  <span className="label block mb-1">Key name</span>
                  <input className="field h-8" value={name} maxLength={32} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Cursor at work" />
                </label>
                <label>
                  <span className="label block mb-1">Expires in</span>
                  <select className="field h-8" value={expiresIn} onChange={(e) => onExpiryChange(Number(e.target.value))}>
                    {expiryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <button className="btn btn-primary h-8" disabled={creating || !name.trim()} onClick={onCreate}>
                  <KeyRound size={14} /> {creating ? 'Creating…' : 'Create key'}
                </button>
              </div>
              <p className="text-t3 text-[11px] mt-2">Keys have read and write access to the projects you are allowed to edit.</p>
            </div>
            {loading ? (
              <div className="p-5 text-t2">Loading API keys…</div>
            ) : keys.length === 0 ? (
              <div className="p-5 text-t2">No MCP API keys yet. Create one when you are ready to connect an AI tool.</div>
            ) : (
              <div className="divide-y divide-line">
                {keys.map((key) => (
                  <div key={key.id} className="p-4 flex items-center gap-3 min-w-0 flex-wrap">
                    <KeyRound size={15} className="text-t2 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{key.name || 'Unnamed key'}</div>
                      <div className="text-t3 text-[11px] mt-1 truncate">{key.start || 'Key'} · created {formatDate(key.createdAt)} · expires {formatDate(key.expiresAt)}</div>
                    </div>
                    <button className="btn btn-danger h-7 px-2 shrink-0" disabled={revokingId === key.id} onClick={() => onRevoke(key)}>
                      <Trash2 size={13} /> {revokingId === key.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="bg-bg1 border border-line rounded-xl p-5" aria-labelledby="local-mcp-heading">
            <div className="flex items-start gap-3">
              <KeyRound size={18} className="text-t2 mt-0.5 shrink-0" />
              <div>
                <h2 id="local-mcp-heading" className="font-semibold">No API key needed here</h2>
                <p className="text-t2 mt-1">{mode === 'desktop' ? 'The desktop app keeps MCP on the local machine and does not require a cloud credential.' : 'This login-free local mode uses the CLI stdio connection instead of remote API keys.'}</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
