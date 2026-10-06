// Local storage & persistent token manager
const TOKEN_KEY = 'ghostove_auth_token';

export async function getStoredToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    // Try Tauri store if available
    const { LazyStore } = await import('@tauri-apps/plugin-store');
    const store = new LazyStore('.ghostove-settings.dat');
    const token = await store.get<string>(TOKEN_KEY);
    if (token) return token;
  } catch (e) {
    // Fallback to localStorage
  }

  return localStorage.getItem(TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  if (typeof window === 'undefined') return;

  localStorage.setItem(TOKEN_KEY, token);

  try {
    const { LazyStore } = await import('@tauri-apps/plugin-store');
    const store = new LazyStore('.ghostove-settings.dat');
    await store.set(TOKEN_KEY, token);
    await store.save();
  } catch (e) {
    // Ignore tauri store fallback
  }
}

export async function clearStoredToken(): Promise<void> {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(TOKEN_KEY);

  try {
    const { LazyStore } = await import('@tauri-apps/plugin-store');
    const store = new LazyStore('.ghostove-settings.dat');
    await store.delete(TOKEN_KEY);
    await store.save();
  } catch (e) {
    // Ignore
  }
}
