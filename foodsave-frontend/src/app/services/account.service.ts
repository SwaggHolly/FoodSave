import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { PRIVACY_POLICY_VERSION } from '../models/privacy-policy';
import type {
  MerchantApplication,
  MerchantApplicationRequest,
  MerchantImageUpload,
  MerchantProductRequest
} from '../models/merchant.model';
import type { UpdateUserProfile, UserProfile } from '../models/user-profile.model';

interface AccountCredentials {
  email: string;
  password: string;
}

interface RegistrationDetails extends AccountCredentials {
  name: string;
  phone: string;
  privacyPolicyVersion: string;
}

interface AccountIdentity {
  sub: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  readonly user = signal<AccountIdentity | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly merchant = signal<MerchantApplication | null>(null);
  readonly isConfigured = Boolean(
    environment.cognito.userPoolId &&
      environment.cognito.userPoolClientId &&
      !environment.cognito.userPoolId.includes('YOUR_') &&
      !environment.cognito.userPoolClientId.includes('YOUR_')
  );
  private readonly isBrowser: boolean;
  private authModule?: Promise<typeof import('@aws-amplify/auth')>;

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  async register(details: RegistrationDetails): Promise<void> {
    const auth = await this.loadAuthModule();
    await auth.signUp({
      username: details.email.trim().toLowerCase(),
      password: details.password,
      options: {
        userAttributes: {
          email: details.email.trim().toLowerCase(),
          name: details.name.trim(),
          'custom:privacy_version': details.privacyPolicyVersion,
          ...(details.phone.trim() ? { phone_number: details.phone.trim() } : {})
        }
      }
    });
  }

  async confirmRegistration(email: string, code: string): Promise<void> {
    const auth = await this.loadAuthModule();
    await auth.confirmSignUp({
      username: email.trim().toLowerCase(),
      confirmationCode: code.trim()
    });
  }

  async resendConfirmationCode(email: string): Promise<void> {
    const auth = await this.loadAuthModule();
    await auth.resendSignUpCode({ username: email.trim().toLowerCase() });
  }

  async signInWithEmail(
    credentials: AccountCredentials,
    privacyPolicyVersion: string
  ): Promise<UserProfile> {
    const auth = await this.loadAuthModule();
    const result = await auth.signIn({
      username: credentials.email.trim().toLowerCase(),
      password: credentials.password
    });
    if (!result.isSignedIn) {
      throw new Error('No se pudo completar el inicio de sesión. Verifica tu cuenta.');
    }
    await auth.updateUserAttributes({
      userAttributes: {
        'custom:privacy_version': privacyPolicyVersion
      }
    });
    await auth.fetchAuthSession({ forceRefresh: true });
    return this.loadProfileForCurrentUser();
  }

  async restoreSession(): Promise<UserProfile | null> {
    if (!this.isBrowser || !this.isConfigured) return null;
    const auth = await this.loadAuthModule();
    const session = await auth.fetchAuthSession();
    if (!session.tokens?.idToken) return null;
    const attributes = await auth.fetchUserAttributes();
    if (attributes['custom:privacy_version'] !== PRIVACY_POLICY_VERSION) {
      await auth.signOut();
      throw new Error(
        'Tu sesión se cerró porque debes aceptar la política de privacidad vigente. Inicia sesión para continuar.'
      );
    }
    return this.loadProfileForCurrentUser();
  }

  async saveProfile(input: UpdateUserProfile): Promise<UserProfile> {
    await this.loadAuthModule();
    const headers = await this.authorizationHeaders();
    const profile = await firstValueFrom(
      this.http.put<UserProfile>(`${environment.apiBaseUrl}/profile`, input, { headers })
    );
    this.profile.set(profile);
    return profile;
  }

  async loadMerchantApplication(): Promise<MerchantApplication | null> {
    const headers = await this.authorizationHeaders();
    try {
      const application = await firstValueFrom(
        this.http.get<MerchantApplication>(
          `${environment.apiBaseUrl}/merchant/application`,
          { headers }
        )
      );
      this.merchant.set(application);
      return application;
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.merchant.set(null);
        return null;
      }
      throw error;
    }
  }

  async submitMerchantApplication(
    input: MerchantApplicationRequest
  ): Promise<MerchantApplication> {
    const headers = await this.authorizationHeaders();
    const application = await firstValueFrom(
      this.http.post<MerchantApplication>(
        `${environment.apiBaseUrl}/merchant/application`,
        input,
        { headers }
      )
    );
    this.merchant.set(application);
    return application;
  }

  async uploadMerchantImage(file: File): Promise<string> {
    const headers = await this.authorizationHeaders();
    const upload = await firstValueFrom(
      this.http.post<MerchantImageUpload>(
        `${environment.apiBaseUrl}/merchant/images/upload-url`,
        { contentType: file.type },
        { headers }
      )
    );
    const formData = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) {
      formData.append(name, value);
    }
    formData.append('file', file);
    await firstValueFrom(
      this.http.post(upload.url, formData, { responseType: 'text' })
    );
    return upload.key;
  }

  async createMerchantProduct(
    input: MerchantProductRequest
  ): Promise<void> {
    const headers = await this.authorizationHeaders();
    await firstValueFrom(
      this.http.post(`${environment.apiBaseUrl}/merchant/products`, input, {
        headers
      })
    );
  }

  async signOutCurrentUser(): Promise<void> {
    const auth = await this.loadAuthModule();
    await auth.signOut();
    this.user.set(null);
    this.profile.set(null);
    this.merchant.set(null);
  }

  private async loadProfileForCurrentUser(): Promise<UserProfile> {
    const auth = await this.loadAuthModule();
    const [currentUser, attributes] = await Promise.all([
      auth.getCurrentUser(),
      auth.fetchUserAttributes()
    ]);
    const email = attributes.email?.trim().toLowerCase();
    if (!email) throw new Error('La cuenta no tiene un correo electrónico válido.');

    const initialProfile: UserProfile = {
      sub: currentUser.userId,
      email,
      name: attributes.name?.trim() || email,
      phone: attributes.phone_number?.trim() ?? '',
      privacyPolicyVersion:
        attributes['custom:privacy_version'] ?? '',
      updatedAt: ''
    };
    this.user.set({ sub: currentUser.userId, email });
    this.profile.set(initialProfile);
    try {
      const headers = await this.authorizationHeaders();
      const profile = await firstValueFrom(
        this.http.get<UserProfile>(`${environment.apiBaseUrl}/profile`, { headers })
      );
      if (profile.privacyPolicyVersion !== PRIVACY_POLICY_VERSION) {
        return this.saveProfile({
          name: profile.name,
          phone: profile.phone,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION
        });
      }
      this.profile.set(profile);
      return profile;
    } catch (error: unknown) {
      if (!(error instanceof HttpErrorResponse) || error.status !== 404) throw error;
      return this.saveProfile({
        name: initialProfile.name,
        phone: initialProfile.phone,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION
      });
    }
  }

  private async authorizationHeaders(): Promise<HttpHeaders> {
    const auth = await this.loadAuthModule();
    const session = await auth.fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new Error('Inicia sesión para consultar tu perfil.');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private async loadAuthModule(): Promise<typeof import('@aws-amplify/auth')> {
    if (!this.isBrowser || !this.isConfigured) {
      throw new Error(
        'Las cuentas aún no están configuradas. Agrega el ID y el cliente de Cognito en el entorno de FoodSave.'
      );
    }
    this.authModule ??= Promise.all([
      import('@aws-amplify/auth'),
      import('@aws-amplify/core')
    ]).then(([auth, { Amplify }]) => {
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: environment.cognito.userPoolId,
            userPoolClientId: environment.cognito.userPoolClientId
          }
        }
      });
      return auth;
    });
    return this.authModule;
  }
}
