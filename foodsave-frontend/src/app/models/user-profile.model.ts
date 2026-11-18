export interface UserProfile {
  sub: string;
  name: string;
  email: string;
  phone: string;
  privacyPolicyVersion?: string;
  privacyAcceptedAt?: string;
  updatedAt: string;
}

export interface UpdateUserProfile {
  name: string;
  phone: string;
  privacyPolicyVersion: string;
}
