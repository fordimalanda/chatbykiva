export class RegisterDto {
  username: string;
  password: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
}

export class LoginDto {
  username: string;
  password: string;
}
