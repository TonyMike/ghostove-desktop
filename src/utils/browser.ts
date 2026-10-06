export async function openBrowserUrl(url: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_browser', { url });
  } catch (err) {
    console.warn('[Ghostove] invoke open_browser failed, trying shell plugin:', err);
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
    } catch (err2) {
      console.warn('[Ghostove] shell open failed, trying window.open:', err2);
      window.open(url, '_blank');
    }
  }
}
