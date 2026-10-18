export interface MonitorInfo {
  name: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_current: boolean;
}

export interface ClickableRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ScreenPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

/**
 * Safe invoke helper that gracefully falls back in non-Tauri / browser dev mode
 */
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.warn(`[WindowManager] invoke('${cmd}') error / dev fallback:`, err);
    return null;
  }
}

export async function getAvailableMonitors(): Promise<MonitorInfo[]> {
  const result = await safeInvoke<MonitorInfo[]>('get_available_monitors');
  if (result && result.length > 0) return result;
  // Browser dev fallback
  return [
    {
      name: 'Main Display (Screen 1)',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      scale_factor: 2,
      is_current: true,
    },
  ];
}

export async function cycleScreen(): Promise<string> {
  const res = await safeInvoke<string>('cycle_screen');
  return res || 'Switched screen';
}

export async function moveToMonitor(
  monitorIndex: number,
  position: ScreenPosition = 'top-right'
): Promise<void> {
  await safeInvoke('move_to_monitor', { monitorIndex, position });
}

export async function setScreenPosition(position: ScreenPosition): Promise<void> {
  await safeInvoke('set_screen_position', { position });
}

export async function closeAppWindow(): Promise<void> {
  await safeInvoke('close_app_window');
}

export async function minimizeAppWindow(): Promise<void> {
  await safeInvoke('minimize_app_window');
}

export async function moveToCursorScreen(): Promise<string> {
  const res = await safeInvoke<string>('move_to_cursor_screen');
  return res || 'Moved to active screen';
}

export async function setAutoFollowScreen(enabled: boolean): Promise<void> {
  await safeInvoke('set_auto_follow_screen', { enabled });
}

export async function getAutoFollowScreen(): Promise<boolean> {
  const res = await safeInvoke<boolean>('get_auto_follow_screen');
  return res !== null ? res : true;
}

/**
 * Selective Click-Through:
 * When enabled, the window ignores cursor events EXCEPT when the mouse is over
 * specified clickable rectangles (such as the toggle-off button).
 */
export async function setSelectiveClickThrough(
  enabled: boolean,
  rects: ClickableRect[] = []
): Promise<void> {
  await safeInvoke('set_selective_click_through', { enabled, rects });
}

export async function resizeWindow(width: number, height: number): Promise<void> {
  const res = await safeInvoke('resize_app_window', { width, height });
  if (res === null) {
    try {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.setSize(new LogicalSize(width, height));
    } catch (err) {
      console.warn('[WindowManager] resizeWindow fallback / error:', err);
    }
  }
}

export async function openPrivacySettings(settingType: string = 'microphone'): Promise<void> {
  await safeInvoke('open_privacy_settings', { settingType });
}

export async function requestScreenCaptureAccess(): Promise<boolean> {
  return (await safeInvoke<boolean>('request_screen_capture_access')) ?? false;
}

export async function startDragging(): Promise<void> {
  const res = await safeInvoke('start_dragging_window');
  if (res === null) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.startDragging();
    } catch (err) {
      console.warn('[WindowManager] startDragging fallback / error:', err);
    }
  }
}

export async function captureScreen(): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<string>('capture_screen');
}

export function usesNativeMacSystemAudio(): boolean {
  return typeof window !== 'undefined'
    && '__TAURI_INTERNALS__' in window
    && /Macintosh|Mac OS X/i.test(navigator.userAgent || navigator.platform);
}

export async function startNativeSystemAudioCapture(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('start_system_audio_capture');
}

export async function stopNativeSystemAudioCapture(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('stop_system_audio_capture');
}

/**
 * Direct aliases for taking a screenshot of code / screen
 */
export const take_screenshot_of_code = captureScreen;
export const takeScreenshotOfCode = captureScreen;

export interface SystemPermissions {
  microphone: boolean;
  screen_capture: boolean;
}

export interface ScreenShareProtectionStatus {
  platform: string;
  status: 'applied' | 'unverified' | 'unsupported' | 'failed';
  method: string;
  message: string;
}

export async function enforceScreenShareProtection(): Promise<ScreenShareProtectionStatus> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return {
      platform: 'browser',
      status: 'unsupported',
      method: 'none',
      message: 'Native screen-share protection is only available in the Ghostove desktop app.',
    };
  }

  const native = await safeInvoke<ScreenShareProtectionStatus>('enforce_screenshare_invisibility');
  return native ?? {
    platform: 'unknown',
    status: 'failed',
    method: 'Tauri screen-share protection command',
    message: 'Ghostove could not read the operating-system capture-exclusion status.',
  };
}

export async function checkSystemPermissions(): Promise<SystemPermissions> {
  // 1. Check native macOS / Windows permissions via Tauri IPC
  const native = await safeInvoke<SystemPermissions>('check_system_permissions');
  if (native !== null && typeof native.microphone === 'boolean') {
    return native;
  }

  // 2. Browser / WebKit permission fallback
  let micGranted = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000 },
    });
    stream.getTracks().forEach((t) => t.stop());
    micGranted = true;
  } catch {
    micGranted = false;
  }

  return {
    microphone: micGranted,
    screen_capture: true,
  };
}

