import { afterEach, describe, expect, test } from 'bun:test';
import { apiCallApi } from '../src/services/api/apiCall';
import { modelsApi } from '../src/services/api/models';

const originalRequest = apiCallApi.request;

afterEach(() => {
  apiCallApi.request = originalRequest;
});

describe('Claude model discovery authentication', () => {
  test('uses the configured version path and bearer token for command auth', async () => {
    let request: Parameters<typeof apiCallApi.request>[0] | undefined;
    apiCallApi.request = (async (payload) => {
      request = payload;
      return {
        statusCode: 200,
        header: {},
        bodyText: '',
        body: { data: [{ id: 'aiden-d1-48' }] },
      };
    }) as typeof apiCallApi.request;

    const models = await modelsApi.fetchClaudeModelsViaApiCall(
      'https://aiden-aiproxy.bytedance.net/v2',
      '',
      {},
      'claude:command:1',
      true
    );

    expect(request?.url).toBe('https://aiden-aiproxy.bytedance.net/v2/models');
    expect(request?.authIndex).toBe('claude:command:1');
    expect(request?.header?.Authorization).toBe('Bearer $TOKEN$');
    expect(request?.header?.['x-api-key']).toBeUndefined();
    expect(models.map((model) => model.name)).toEqual(['aiden-d1-48']);
  });

  test('keeps Anthropic x-api-key behavior for static credentials', async () => {
    let request: Parameters<typeof apiCallApi.request>[0] | undefined;
    apiCallApi.request = (async (payload) => {
      request = payload;
      return { statusCode: 200, header: {}, bodyText: '', body: { data: [] } };
    }) as typeof apiCallApi.request;

    await modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', 'static-key');

    expect(request?.url).toBe('https://api.anthropic.com/v1/models');
    expect(request?.header?.['x-api-key']).toBe('static-key');
    expect(request?.header?.Authorization).toBeUndefined();
  });

  test('normalizes a versioned messages endpoint to its models endpoint', async () => {
    let request: Parameters<typeof apiCallApi.request>[0] | undefined;
    apiCallApi.request = (async (payload) => {
      request = payload;
      return { statusCode: 200, header: {}, bodyText: '', body: { data: [] } };
    }) as typeof apiCallApi.request;

    await modelsApi.fetchClaudeModelsViaApiCall(
      'https://proxy.example.com/v2/messages',
      'static-key'
    );

    expect(request?.url).toBe('https://proxy.example.com/v2/models');
  });
});
