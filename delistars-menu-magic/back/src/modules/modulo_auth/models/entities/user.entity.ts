/**
 * Auth Module - Interfaces
 */

export interface IUser {
  _id?: string;
  email: string;
  password: string;
  name: string;
  role: 'customer' | 'admin';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAuthPayload {
  userId: string;
  email: string;
  role: string;
}

export interface ITokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}
