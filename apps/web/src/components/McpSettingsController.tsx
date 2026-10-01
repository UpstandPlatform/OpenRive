'use client';

import { useSyncExternalStore } from 'react';
import { McpSettingsView, type McpConnectionMode } from './McpSettingsView';
import { useDesktop } from './desktop';
import { useMcpSettings } from '@/lib/client/useMcpSettings';
import { useSession } from '@/lib/client/session';

const subscribe = () => () => {};

function useBrowserOrigin() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => '',
  );
}

export function McpSettingsController() {
  const desktop = useDesktop();
  const authEnabled = useSession((state) => state.authEnabled);
  const settings = useMcpSettings(authEnabled);
  const origin = useBrowserOrigin();
  const endpoint = origin ? `${origin}/api/mcp` : '/api/mcp';
  const mode: McpConnectionMode = authEnabled ? 'remote' : desktop ? 'desktop' : 'local';

  const revoke = (key: Parameters<typeof settings.revoke>[0]) => {
    if (window.confirm(`Revoke “${key.name || 'this API key'}”? Connected AI tools will stop working immediately.`)) void settings.revoke(key);
  };

  return (
    <McpSettingsView
      mode={mode}
      endpoint={endpoint}
      keys={settings.keys}
      loading={settings.loading}
      creating={settings.creating}
      revokingId={settings.revokingId}
      error={settings.error}
      secret={settings.secret}
      copied={settings.copied}
      name={settings.name}
      expiresIn={settings.expiresIn}
      onNameChange={settings.setName}
      onExpiryChange={settings.setExpiresIn}
      onCreate={() => void settings.create()}
      onReload={() => void settings.reload()}
      onRevoke={revoke}
      onCopy={(value, target) => void settings.copy(value, target)}
      onDismissSecret={settings.dismissSecret}
      onClearError={settings.clearError}
    />
  );
}
