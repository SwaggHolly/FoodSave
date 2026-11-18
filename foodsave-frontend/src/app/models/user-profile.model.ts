export interface UserProfile {
  sub: string;
  name: string;
  email: string;
  phone: string;
  updatedAt: string;
}

export interface UpdateUserProfile {
  name: string;
  phone: string;
}
