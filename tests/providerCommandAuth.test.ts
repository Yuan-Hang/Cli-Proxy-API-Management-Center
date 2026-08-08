import { afterEach, describe, expect, test } from 'bun:test';
import {
  getProviderRecentStatusData,
  getProviderTotalStats,
  type ProviderRecentUsageMap,
} from '../src/components/providers/utils';
import { codexToResource } from '../src/features/providers/adapters';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse } from '../src/services/api/transformers';

const originalGet = apiClient.get;
const originalPut = apiClient.put;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
});

describe('provider command auth integration', () => {
  test('normalizes Codex command auth and exposes its identity to the workbench', () => {
    const config = normalizeConfigResponse({
      'codex-api-key': [
        {
          auth: {
            command: '/usr/local/bin/fetch-token',
            args: ['--audience', 'codex'],
            'timeout-ms': 5000,
            'refresh-interval-ms': 300000,
          },
          'base-url': 'https://proxy.example.com/v1',
          'auth-index': 'codex:apikey:123',
          'auth-key': 'auth-command:stable-id',
          'auth-source': 'command',
        },
      ],
    });

    const provider = config.codexApiKeys?.[0];
    expect(provider).toBeDefined();
    expect(provider?.apiKey).toBe('');
    expect(provider?.auth?.command).toBe('/usr/local/bin/fetch-token');
    expect(provider?.authKey).toBe('auth-command:stable-id');
    expect(provider?.authSource).toBe('command');

    const resource = codexToResource(provider!, 0);
    expect(resource.flags.commandAuth).toBe(true);
    expect(resource.apiKeyPreview).toBe('auth: /usr/local/bin/fetch-token');
    expect(resource.authKey).toBe('auth-command:stable-id');
    expect(resource.authSource).toBe('command');
  });

  test('updates an existing command-auth record by backend index', async () => {
    let written: unknown;
    apiClient.get = (async () => ({
      'codex-api-key': [
        { 'api-key': 'static-key', 'base-url': 'https://static.example.com' },
        {
          auth: { command: 'old-command' },
          'base-url': 'https://proxy.example.com/v1',
          'future-field': 'preserved',
          'auth-index': 'response-only',
          'auth-key': 'response-only',
          'auth-source': 'command',
        },
      ],
    })) as typeof apiClient.get;
    apiClient.put = (async (_url: string, data?: unknown) => {
      written = data;
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.updateCodexConfig(
      '',
      'https://proxy.example.com/v1',
      {
        apiKey: '',
        auth: { command: 'new-command', args: ['auth', 'token'] },
        baseUrl: 'https://proxy.example.com/v1',
      },
      1
    );

    expect(written).toEqual([
      { 'api-key': 'static-key', 'base-url': 'https://static.example.com' },
      {
        'future-field': 'preserved',
        auth: { command: 'new-command', args: ['auth', 'token'] },
        'base-url': 'https://proxy.example.com/v1',
      },
    ]);
  });

  test('matches command-auth totals and rolling success rate by auth identity', () => {
    const usage: ProviderRecentUsageMap = new Map([
      [
        'codex',
        new Map([
          [
            'https://proxy.example.com/v1|auth-command:stable-id',
            {
              authKey: 'auth-command:stable-id',
              authSource: 'command',
              success: 9,
              failed: 1,
              recentRequests: [{ success: 9, failed: 1 }],
            },
          ],
        ]),
      ],
    ]);
    const identity = {
      authKey: 'auth-command:stable-id',
      authSource: 'command',
      baseUrl: 'https://proxy.example.com/v1',
    };

    expect(getProviderTotalStats(usage, 'codex', identity)).toEqual({ success: 9, failure: 1 });
    const status = getProviderRecentStatusData(usage, 'codex', identity);
    expect(status.totalSuccess).toBe(9);
    expect(status.totalFailure).toBe(1);
    expect(status.successRate).toBe(90);
  });
});
