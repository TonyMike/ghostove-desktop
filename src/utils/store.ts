import { invoke, isTauri } from '@tauri-apps/api/core';

const TOKEN_KEY = 'ghostove_auth_token';

export async function getStoredToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return localStorage.getItem(TOKEN_KEY);

  try {
    const token = await invoke<string | null>('get_stored_auth_token');
    if (token) return token;

    // Move sessions from the former webview store into the OS keychain once.
    const legacyToken = localStorage.getItem(TOKEN_KEY);
    if (legacyToken) {
      await invoke('set_stored_auth_token', { token: legacyToken });
      localStorage.removeItem(TOKEN_KEY);
      return legacyToken;
    }
  } catch (error) {
    console.error('[Auth] Could not access the operating-system keychain.');
  }
  return null;
}

export async function setStoredToken(token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (isTauri()) {
    await invoke('set_stored_auth_token', { token });
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  if (isTauri()) await invoke('clear_stored_auth_token');
}
