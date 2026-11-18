import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { UpdateUserProfile, UserProfile } from '../models/user-profile.model';

interface AccountCredentials {
  email: string;
  password: string;
}

interface RegistrationDetails extends AccountCredentials {
  name: string;
  phone: string;
}

interface AccountIdentity {
  sub: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  readonly user = signal<AccountIdentity | null>(null);
  readonly profile = signal<UserProfile | null>(null);
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

  async signInWithEmail(credentials: AccountCredentials): Promise<UserProfile> {
    const auth = await this.loadAuthModule();
    const result = await auth.signIn({
      username: credentials.email.trim().toLowerCase(),
      password: credentials.password
    });
    if (!result.isSignedIn) {
      throw new Error('No se pudo completar el inicio de sesión. Verifica tu cuenta.');
    }
    return this.loadProfileForCurrentUser();
  }

  async restoreSession(): Promise<UserProfile | null> {
    if (!this.isBrowser || !this.isConfigured) return null;
    const auth = await this.loadAuthModule();
    const session = await auth.fetchAuthSession();
    if (!session.tokens?.idToken) return null;
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

  async signOutCurrentUser(): Promise<void> {
    const auth = await this.loadAuthModule();
    await auth.signOut();
    this.user.set(null);
    this.profile.set(null);
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
      updatedAt: ''
    };
    this.user.set({ sub: currentUser.userId, email });
    this.profile.set(initialProfile);
    try {
      const headers = await this.authorizationHeaders();
      const profile = await firstValueFrom(
        this.http.get<UserProfile>(`${environment.apiBaseUrl}/profile`, { headers })
      );
      this.profile.set(profile);
      return profile;
    } catch (error: unknown) {
      if (!(error instanceof HttpErrorResponse) || error.status !== 404) throw error;
      return this.saveProfile({
        name: initialProfile.name,
        phone: initialProfile.phone
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
