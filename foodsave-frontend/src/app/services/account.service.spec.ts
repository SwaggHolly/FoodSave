import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { cognitoUserPoolsTokenProvider } from '@aws-amplify/auth/cognito';
import { AccountService } from './account.service';

describe('AccountService authentication setup', () => {
  it('configures Cognito token storage and uses it to restore sessions', async () => {
    TestBed.configureTestingModule({
      providers: [AccountService, provideHttpClient()]
    });
    const getTokens = vi.spyOn(cognitoUserPoolsTokenProvider, 'getTokens')
      .mockResolvedValue(null);
    try {
      const service = TestBed.inject(AccountService);
      await expect(service.restoreSession()).resolves.toBeNull();
      expect(getTokens).toHaveBeenCalled();
      await expect(
        cognitoUserPoolsTokenProvider.tokenOrchestrator.getDeviceMetadata('test-user')
      ).resolves.toBeNull();
    } finally {
      getTokens.mockRestore();
    }
  });
});
