import { apiClient } from './axios-client';
import { registerPushToken, unregisterPushToken } from './push-tokens';

jest.mock('./axios-client', () => ({
  apiClient: {
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedClient = apiClient as jest.Mocked<typeof apiClient>;

describe('push-tokens api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a push token for this device', async () => {
    mockedClient.post.mockResolvedValue({ data: undefined });

    await registerPushToken({ token: 'ExponentPushToken[abc]', platform: 'ios' });

    expect(mockedClient.post).toHaveBeenCalledWith('/users/me/push-tokens', {
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
    });
  });

  it('unregisters a push token on logout', async () => {
    mockedClient.delete.mockResolvedValue({ data: undefined });

    await unregisterPushToken({ token: 'ExponentPushToken[abc]' });

    expect(mockedClient.delete).toHaveBeenCalledWith('/users/me/push-tokens', {
      data: { token: 'ExponentPushToken[abc]' },
    });
  });

  it('propagates a failed registration call', async () => {
    mockedClient.post.mockRejectedValue(new Error('server error'));

    await expect(registerPushToken({ token: 't', platform: 'android' })).rejects.toThrow(
      'server error',
    );
  });
});
