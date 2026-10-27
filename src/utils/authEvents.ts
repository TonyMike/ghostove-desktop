export const AUTHENTICATION_FAILURE_EVENT = 'ghostove:authentication-failed';

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export function notifyAuthenticationFailure(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTHENTICATION_FAILURE_EVENT));
  }
}
