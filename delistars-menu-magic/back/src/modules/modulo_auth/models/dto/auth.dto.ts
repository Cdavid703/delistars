/**
 * Auth DTO - Login
 */
export class LoginDto {
  email!: string;
  password!: string;
}

/**
 * Auth DTO - Register
 */
export class RegisterDto {
  email!: string;
  password!: string;
  name!: string;
}

/**
 * Auth DTO - Response
 */
export class AuthResponseDto {
  accessToken!: string;
  user!: {
    _id: string;
    email: string;
    name: string;
    role: string;
  };
}
