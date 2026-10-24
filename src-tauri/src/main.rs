// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(unexpected_cfgs)]

mod dev_pairing;

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

#[cfg(target_os = "macos")]
mod macos_types {
    pub type Id = *mut objc::runtime::Object;

    #[repr(C)]
    #[derive(Copy, Clone, Debug, Default)]
    pub struct CGPoint {
        pub x: f64,
        pub y: f64,
    }
    #[repr(C)]
    #[derive(Copy, Clone, Debug, Default)]
    pub struct CGSize {
        pub width: f64,
        pub height: f64,
    }
    #[repr(C)]
    #[derive(Copy, Clone, Debug, Default)]
    pub struct CGRect {
        pub origin: CGPoint,
        pub size: CGSize,
    }
    pub type NSPoint = CGPoint;
    pub type NSRect = CGRect;

    // NSWindowCollectionBehavior flags:
    // CanJoinAllSpaces = 1 << 0 = 1
    // IgnoresCycle = 1 << 6 = 64
    // FullScreenAuxiliary = 1 << 8 = 256
    pub const NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES: usize = 1 << 0;
    pub const NS_WINDOW_COLLECTION_BEHAVIOR_IGNORES_CYCLE: usize = 1 << 6;
    pub const NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY: usize = 1 << 8;

    // NSWindowStyleMaskNonactivatingPanel = 1 << 7 = 128
    // Critical: prevents clicking the panel from deactivating or switching away from fullscreen Spaces
    pub const NS_WINDOW_STYLE_MASK_NONACTIVATING_PANEL: usize = 1 << 7;

    // NSScreenSaverWindowLevel = 1000 (kCGScreenSaverWindowLevelKey)
    // Ensures the panel is displayed firmly above full-screen application spaces (browsers, IDEs, etc.)
    pub const NS_SCREEN_SAVER_WINDOW_LEVEL: i32 = 1000;
}

#[cfg(target_os = "macos")]
mod macos_panel {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel, BOOL, YES};
    use std::sync::Once;

    extern "C" {
        pub fn object_setClass(obj: *mut Object, cls: *const Class) -> *const Class;
    }

    static REGISTER_PANEL_CLASS: Once = Once::new();
    const CUSTOM_PANEL_CLASS_NAME: &str = "GhostoveFloatingPanel";

    extern "C" fn can_become_key_window(_this: &Object, _cmd: Sel) -> BOOL {
        YES
    }

    extern "C" fn can_become_main_window(_this: &Object, _cmd: Sel) -> BOOL {
        YES
    }

    pub fn get_or_register_custom_panel_class() -> &'static Class {
        REGISTER_PANEL_CLASS.call_once(|| {
            if let Some(super_cls) = Class::get("NSPanel") {
                if let Some(mut decl) = ClassDecl::new(CUSTOM_PANEL_CLASS_NAME, super_cls) {
                    unsafe {
                        decl.add_method(
                            sel!(canBecomeKeyWindow),
                            can_become_key_window as extern "C" fn(&Object, Sel) -> BOOL,
                        );
                        decl.add_method(
                            sel!(canBecomeMainWindow),
                            can_become_main_window as extern "C" fn(&Object, Sel) -> BOOL,
                        );
                    }
                    decl.register();
                }
            }
        });
        Class::get(CUSTOM_PANEL_CLASS_NAME)
            .or_else(|| Class::get("NSPanel"))
            .expect("Failed to obtain NSPanel class")
    }
}

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signer, SigningKey};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager, WebviewWindow};

static SYSTEM_AUDIO_APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static SYSTEM_AUDIO_ACTIVE: AtomicBool = AtomicBool::new(false);
static SYSTEM_AUDIO_COMMAND_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeSystemAudioChunk {
    pcm_base64: String,
    sample_rate: u32,
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn ghostove_system_audio_start(
        error_buffer: *mut std::ffi::c_char,
        error_capacity: usize,
    ) -> i32;
    fn ghostove_system_audio_stop();
}

#[no_mangle]
unsafe extern "C" fn ghostove_on_system_audio(samples: *const f32, count: usize, sample_rate: u32) {
    if samples.is_null() || count == 0 {
        return;
    }
    let Some(app) = SYSTEM_AUDIO_APP.get() else {
        return;
    };

    // ScreenCaptureKit's callback buffer is valid only for the duration of the
    // callback, so copy and encode it before returning across the FFI boundary.
    let samples = unsafe { std::slice::from_raw_parts(samples, count) };
    let mut pcm = Vec::with_capacity(count * 2);
    for sample in samples {
        let sample = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        pcm.extend_from_slice(&sample.to_le_bytes());
    }

    let chunk = NativeSystemAudioChunk {
        pcm_base64: base64::engine::general_purpose::STANDARD.encode(pcm),
        sample_rate,
    };
    if let Err(error) = app.emit("system-audio-chunk", chunk) {
        eprintln!("[Ghostove] Could not forward captured system audio: {error}");
    }
}

#[tauri::command]
async fn start_system_audio_capture(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = SYSTEM_AUDIO_COMMAND_LOCK.lock().await;
    if SYSTEM_AUDIO_ACTIVE.load(Ordering::Acquire) {
        return Ok(());
    }
    let _ = SYSTEM_AUDIO_APP.set(app);

    #[cfg(target_os = "macos")]
    {
        let start_result = tokio::task::spawn_blocking(|| {
            let mut error_buffer = [0i8; 1024];
            let started = unsafe {
                ghostove_system_audio_start(error_buffer.as_mut_ptr(), error_buffer.len())
            };
            if started == 1 {
                Ok(())
            } else {
                let message = unsafe { std::ffi::CStr::from_ptr(error_buffer.as_ptr()) }
                    .to_string_lossy()
                    .into_owned();
                Err(if message.is_empty() {
                    "macOS could not start system audio capture.".to_string()
                } else {
                    message
                })
            }
        })
        .await
        .map_err(|error| format!("System audio capture worker failed: {error}"))?;
        start_result?;
        SYSTEM_AUDIO_ACTIVE.store(true, Ordering::Release);
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Native system audio capture is currently available on macOS only.".to_string())
    }
}

#[tauri::command]
async fn stop_system_audio_capture() -> Result<(), String> {
    let _guard = SYSTEM_AUDIO_COMMAND_LOCK.lock().await;
    if !SYSTEM_AUDIO_ACTIVE.swap(false, Ordering::AcqRel) {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    tokio::task::spawn_blocking(|| unsafe { ghostove_system_audio_stop() })
        .await
        .map_err(|error| format!("System audio capture stop worker failed: {error}"))?;

    Ok(())
}

// -------------------------------------------------------------------
// OS-Specific Screen-Share Invisibility & Virtual Desktop Behaviors
// -------------------------------------------------------------------

// Temporarily disabled. Set this to true to re-enable OS-level capture exclusion.
const SCREEN_SHARE_INVISIBILITY_ENABLED: bool = false;

fn screen_share_protection_disabled() -> ScreenShareProtectionStatus {
    ScreenShareProtectionStatus {
        platform: std::env::consts::OS.into(),
        status: "disabled".into(),
        method: "none".into(),
        message: "Screen-share invisibility is temporarily disabled.".into(),
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ScreenShareProtectionStatus {
    pub platform: String,
    pub status: String,
    pub method: String,
    pub message: String,
}

#[cfg(target_os = "windows")]
fn apply_screen_share_invisibility(window: &WebviewWindow) -> ScreenShareProtectionStatus {
    if !SCREEN_SHARE_INVISIBILITY_ENABLED {
        return screen_share_protection_disabled();
    }

    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowDisplayAffinity, SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };

    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd,
        Err(error) => {
            return ScreenShareProtectionStatus {
                platform: "windows".into(),
                status: "failed".into(),
                method: "SetWindowDisplayAffinity".into(),
                message: format!("Could not access the Ghostove window: {error}"),
            };
        }
    };

    let applied = unsafe { SetWindowDisplayAffinity(hwnd.0 as _, WDA_EXCLUDEFROMCAPTURE) };
    if applied == 0 {
        return ScreenShareProtectionStatus {
            platform: "windows".into(),
            status: "failed".into(),
            method: "SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)".into(),
            message: "Windows could not apply capture exclusion to the Ghostove window.".into(),
        };
    }

    let mut current_affinity = 0;
    let verified = unsafe {
        GetWindowDisplayAffinity(hwnd.0 as _, &mut current_affinity) != 0
            && current_affinity == WDA_EXCLUDEFROMCAPTURE
    };

    ScreenShareProtectionStatus {
        platform: "windows".into(),
        status: if verified { "applied" } else { "unverified" }.into(),
        method: "SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)".into(),
        message: if verified {
            "Windows reports the capture-exclusion flag is set. Effective exclusion requires Windows 10 version 2004 or newer and supported OS capture paths; other sharing methods may still capture this window.".into()
        } else {
            "Windows accepted the capture-exclusion request, but Ghostove could not verify the active setting.".into()
        },
    }
}

#[cfg(target_os = "macos")]
fn apply_screen_share_invisibility(window: &WebviewWindow) -> ScreenShareProtectionStatus {
    if !SCREEN_SHARE_INVISIBILITY_ENABLED {
        return screen_share_protection_disabled();
    }

    use macos_types::*;
    use macos_panel::*;

    let ns_window_ptr = match window.ns_window() {
        Ok(window) => window,
        Err(error) => {
            return ScreenShareProtectionStatus {
                platform: "macos".into(),
                status: "failed".into(),
                method: "NSWindow sharing exclusion request".into(),
                message: format!("Could not access the Ghostove window: {error}"),
            };
        }
    };
    let ns_window = ns_window_ptr as Id;
    unsafe {
        // 1. Convert TaoWindow (NSWindow) into GhostoveFloatingPanel (NSPanel subclass)
        // macOS strictly requires an NSPanel to display over another application's native full-screen space.
        let panel_cls = get_or_register_custom_panel_class();
        object_setClass(ns_window, panel_cls as *const _);

        // 2. Mark as floating panel
        let _: () = msg_send![ns_window, setFloatingPanel: 1i8];

        // 3. Add NSWindowStyleMaskNonactivatingPanel (128)
        // Prevents clicking the panel from stealing focus away from the full-screen app or causing macOS to exit/switch the full-screen Space
        let current_mask: usize = msg_send![ns_window, styleMask];
        let _: () = msg_send![ns_window, setStyleMask: current_mask | NS_WINDOW_STYLE_MASK_NONACTIVATING_PANEL];

        // 4. Best-effort sharing exclusion request. Apple marks this setting as legacy;
        // it is not reliable evidence that modern screen-sharing clients omit the window.
        let _: () = msg_send![ns_window, setSharingType: 0usize];

        // 5. Ensure the panel never hides when deactivated
        let _: () = msg_send![ns_window, setHidesOnDeactivate: 0i8];
        let _: () = msg_send![ns_window, setCanHide: 0i8];

        // 6. Works when modal dialogs are present
        let _: () = msg_send![ns_window, setWorksWhenModal: 1i8];

        // 7. Collection behavior:
        // CanJoinAllSpaces: Window is visible on ALL macOS virtual desktops / spaces simultaneously!
        // FullScreenAuxiliary: Window displays over full-screen apps
        // IgnoresCycle: Does not participate in standard Cmd+` window cycling
        let behavior: usize = NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES
            | NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY
            | NS_WINDOW_COLLECTION_BEHAVIOR_IGNORES_CYCLE;
        let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

        // 8. Set level to NS_SCREEN_SAVER_WINDOW_LEVEL (1000)
        // Sits firmly above full-screen browsers and code editors
        let _: () = msg_send![ns_window, setLevel: NS_SCREEN_SAVER_WINDOW_LEVEL];

        // 9. Order front regardless of current application state
        let _: () = msg_send![ns_window, orderFrontRegardless];
    }
    println!("[Ghostove macOS] Converted to NSPanel, NonactivatingPanel, CanJoinAllSpaces, FullScreenAuxiliary, Level 1000, and orderFrontRegardless");
    ScreenShareProtectionStatus {
        platform: "macos".into(),
        status: "unverified".into(),
        method: "NSWindow sharing exclusion request".into(),
        message: "Ghostove requested the legacy macOS sharing exclusion. Modern screen-sharing behavior is not guaranteed.".into(),
    }
}


#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn apply_screen_share_invisibility(_window: &WebviewWindow) -> ScreenShareProtectionStatus {
    if !SCREEN_SHARE_INVISIBILITY_ENABLED {
        return screen_share_protection_disabled();
    }

    println!("[Ghostove Linux] Screen share exclusion stub.");
    ScreenShareProtectionStatus {
        platform: std::env::consts::OS.into(),
        status: "unsupported".into(),
        method: "none".into(),
        message: "Ghostove does not currently provide native screen-share exclusion on this platform.".into(),
    }
}

#[cfg(target_os = "macos")]
fn ensure_visible_on_all_spaces(window: &WebviewWindow) {
    use macos_types::*;

    let _ = window.set_visible_on_all_workspaces(true);
    if let Ok(ns_window_ptr) = window.ns_window() {
        let ns_window = ns_window_ptr as Id;
        let behavior = NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES
            | NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY
            | NS_WINDOW_COLLECTION_BEHAVIOR_IGNORES_CYCLE;
        unsafe {
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        }
    }
}

#[cfg(target_os = "windows")]
fn follow_active_virtual_desktop(hwnd_value: usize, auto_follow: Arc<AtomicBool>) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Shell::{IVirtualDesktopManager, VirtualDesktopManager};
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    std::thread::spawn(move || {
        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.ok();
        if initialized.is_err() {
            eprintln!("[Ghostove Windows] Could not initialize virtual desktop tracking.");
            return;
        }

        let desktop_manager: IVirtualDesktopManager = match unsafe {
            CoCreateInstance(&VirtualDesktopManager, None, CLSCTX_INPROC_SERVER)
        } {
            Ok(manager) => manager,
            Err(error) => {
                eprintln!("[Ghostove Windows] Could not create virtual desktop manager: {error}");
                return;
            }
        };

        let ghostove_window = HWND(hwnd_value as _);
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if !auto_follow.load(Ordering::SeqCst) {
                continue;
            }

            let foreground = unsafe { GetForegroundWindow() };
            if foreground.0.is_null() || foreground == ghostove_window {
                continue;
            }

            let on_active_desktop =
                unsafe { desktop_manager.IsWindowOnCurrentVirtualDesktop(ghostove_window) };
            if matches!(on_active_desktop, Ok(value) if value.0 != 0) {
                continue;
            }

            if let Ok(active_desktop_id) = unsafe { desktop_manager.GetWindowDesktopId(foreground) }
            {
                if let Err(error) = unsafe {
                    desktop_manager.MoveWindowToDesktop(ghostove_window, &active_desktop_id)
                } {
                    eprintln!(
                        "[Ghostove Windows] Could not follow the active virtual desktop: {error}"
                    );
                }
            }
        }
    });
}

// -------------------------------------------------------------------
// Monitor & Window Position Data Structures
// -------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MonitorInfo {
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_current: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ClickableRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub struct ClickThroughManager {
    is_active: Arc<AtomicBool>,
    clickable_rects: Arc<Mutex<Vec<ClickableRect>>>,
}

impl Default for ClickThroughManager {
    fn default() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
            clickable_rects: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

pub struct ScreenStateManager {
    pub auto_follow: Arc<AtomicBool>,
    pub current_dock_position: Arc<Mutex<String>>,
}

impl Default for ScreenStateManager {
    fn default() -> Self {
        Self {
            auto_follow: Arc::new(AtomicBool::new(true)),
            current_dock_position: Arc::new(Mutex::new("center".to_string())),
        }
    }
}

// -------------------------------------------------------------------
// Selective Hit-Testing for Click-Through Exceptions
// -------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn is_mouse_over_rects(window: &WebviewWindow, rects: &[ClickableRect]) -> bool {
    use macos_types::*;

    if rects.is_empty() {
        return false;
    }

    if let Ok(ns_window_ptr) = window.ns_window() {
        let ns_window = ns_window_ptr as Id;
        unsafe {
            let frame: NSRect = msg_send![ns_window, frame];
            if let Some(cls) = objc::runtime::Class::get("NSEvent") {
                let mouse_loc: NSPoint = msg_send![cls, mouseLocation];

                // In macOS Cocoa: (0,0) is bottom-left of screen.
                // window frame.origin is bottom-left of window.
                // In Web CSS coordinates: (0,0) is top-left of window.
                for r in rects {
                    let btn_x_min = frame.origin.x + r.x;
                    let btn_x_max = btn_x_min + r.width;
                    let btn_y_max = frame.origin.y + frame.size.height - r.y;
                    let btn_y_min = btn_y_max - r.height;

                    if mouse_loc.x >= btn_x_min && mouse_loc.x <= btn_x_max && mouse_loc.y >= btn_y_min && mouse_loc.y <= btn_y_max {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn is_mouse_over_rects(window: &WebviewWindow, rects: &[ClickableRect]) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    use windows_sys::Win32::Foundation::POINT;

    if rects.is_empty() {
        return false;
    }

    if let (Ok(win_pos), Ok(scale)) = (window.outer_position(), window.scale_factor()) {
        unsafe {
            let mut pt = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut pt) != 0 {
                let cx = pt.x as f64;
                let cy = pt.y as f64;

                for r in rects {
                    let btn_x_min = win_pos.x as f64 + (r.x * scale);
                    let btn_x_max = btn_x_min + (r.width * scale);
                    let btn_y_min = win_pos.y as f64 + (r.y * scale);
                    let btn_y_max = btn_y_min + (r.height * scale);

                    if cx >= btn_x_min && cx <= btn_x_max && cy >= btn_y_min && cy <= btn_y_max {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn is_mouse_over_rects(_window: &WebviewWindow, _rects: &[ClickableRect]) -> bool {
    false
}

// -------------------------------------------------------------------
// Multi-Monitor Cursor & Window Screen Detection
// -------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn get_cursor_monitor_index(_window: &WebviewWindow) -> Option<usize> {
    use macos_types::*;

    unsafe {
        let event_cls = objc::runtime::Class::get("NSEvent")?;
        let mouse_loc: NSPoint = msg_send![event_cls, mouseLocation];

        let screen_cls = objc::runtime::Class::get("NSScreen")?;
        let screens: Id = msg_send![screen_cls, screens];
        let count: usize = msg_send![screens, count];

        for i in 0..count {
            let scr: Id = msg_send![screens, objectAtIndex: i];
            let frame: NSRect = msg_send![scr, frame];
            if mouse_loc.x >= frame.origin.x
                && mouse_loc.x <= frame.origin.x + frame.size.width
                && mouse_loc.y >= frame.origin.y
                && mouse_loc.y <= frame.origin.y + frame.size.height
            {
                return Some(i);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_cursor_monitor_index(window: &WebviewWindow) -> Option<usize> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    use windows_sys::Win32::Foundation::POINT;

    if let Ok(monitors) = window.available_monitors() {
        unsafe {
            let mut pt = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut pt) != 0 {
                let cx = pt.x;
                let cy = pt.y;
                for (i, m) in monitors.iter().enumerate() {
                    let pos = m.position();
                    let size = m.size();
                    if cx >= pos.x
                        && cx <= pos.x + size.width as i32
                        && cy >= pos.y
                        && cy <= pos.y + size.height as i32
                    {
                        return Some(i);
                    }
                }
            }
        }
    }
    None
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_cursor_monitor_index(_window: &WebviewWindow) -> Option<usize> {
    None
}

#[cfg(target_os = "macos")]
fn is_cursor_inside_window(window: &WebviewWindow) -> bool {
    use macos_types::*;

    if let Ok(ns_window_ptr) = window.ns_window() {
        let ns_window = ns_window_ptr as Id;
        unsafe {
            let frame: NSRect = msg_send![ns_window, frame];
            if let Some(cls) = objc::runtime::Class::get("NSEvent") {
                let mouse_loc: NSPoint = msg_send![cls, mouseLocation];
                return mouse_loc.x >= frame.origin.x
                    && mouse_loc.x <= frame.origin.x + frame.size.width
                    && mouse_loc.y >= frame.origin.y
                    && mouse_loc.y <= frame.origin.y + frame.size.height;
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn is_cursor_inside_window(window: &WebviewWindow) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    use windows_sys::Win32::Foundation::POINT;

    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
        unsafe {
            let mut pt = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut pt) != 0 {
                return pt.x >= pos.x
                    && pt.x <= pos.x + size.width as i32
                    && pt.y >= pos.y
                    && pt.y <= pos.y + size.height as i32;
            }
        }
    }
    false
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn is_cursor_inside_window(_window: &WebviewWindow) -> bool {
    false
}

fn get_current_monitor_index(window: &WebviewWindow) -> Option<usize> {
    let monitors = window.available_monitors().ok()?;
    let cur = window.current_monitor().ok()??;
    let cur_pos = cur.position();
    for (i, m) in monitors.iter().enumerate() {
        if m.position() == cur_pos {
            return Some(i);
        }
    }
    None
}

fn move_window_to_monitor(
    window: &WebviewWindow,
    monitor_index: usize,
    dock_position: &str,
) -> Result<(), String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    if let Some(target) = monitors.get(monitor_index) {
        let m_pos = target.position();
        let m_size = target.size();
        let win_size = window.outer_size().unwrap_or(tauri::PhysicalSize { width: 440, height: 600 });
        let margin = 0i32;

        let (target_x, target_y) = match dock_position {
            "top-left" => (m_pos.x + margin, m_pos.y + margin),
            "top-center" => (m_pos.x + (m_size.width as i32 - win_size.width as i32) / 2, m_pos.y + margin),
            "top-right" => (m_pos.x + m_size.width as i32 - win_size.width as i32 - margin, m_pos.y + margin),
            "bottom-left" => (m_pos.x + margin, m_pos.y + m_size.height as i32 - win_size.height as i32 - margin),
            "bottom-right" => (m_pos.x + m_size.width as i32 - win_size.width as i32 - margin, m_pos.y + m_size.height as i32 - win_size.height as i32 - margin),
            "center" => (
                m_pos.x + (m_size.width as i32 - win_size.width as i32) / 2,
                m_pos.y + (m_size.height as i32 - win_size.height as i32) / 2,
            ),
            _ => (
                m_pos.x + (m_size.width as i32 - win_size.width as i32) / 2,
                m_pos.y + (m_size.height as i32 - win_size.height as i32) / 2,
            ),
        };

        window.set_position(tauri::PhysicalPosition::new(target_x, target_y)).map_err(|e| e.to_string())?;

        #[cfg(target_os = "macos")]
        {
            use macos_types::*;
            if let Ok(ns_window_ptr) = window.ns_window() {
                let ns_window = ns_window_ptr as Id;
                unsafe {
                    let _: () = msg_send![ns_window, setLevel: NS_SCREEN_SAVER_WINDOW_LEVEL];
                    let _: () = msg_send![ns_window, orderFrontRegardless];
                }
            }
        }
    }
    Ok(())
}

// -------------------------------------------------------------------
// Tauri IPC Commands
// -------------------------------------------------------------------

#[tauri::command]
fn enforce_screenshare_invisibility(window: WebviewWindow) -> ScreenShareProtectionStatus {
    apply_screen_share_invisibility(&window)
}

#[tauri::command]
fn set_click_through(window: WebviewWindow, ignore: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_selective_click_through(
    window: WebviewWindow,
    enabled: bool,
    rects: Vec<ClickableRect>,
    state: tauri::State<'_, ClickThroughManager>,
) -> Result<(), String> {
    if !enabled {
        state.is_active.store(false, Ordering::SeqCst);
        if let Ok(mut lock) = state.clickable_rects.lock() {
            lock.clear();
        }
        window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if let Ok(mut lock) = state.clickable_rects.lock() {
        *lock = rects;
    }

    let was_already_active = state.is_active.swap(true, Ordering::SeqCst);
    if !was_already_active {
        let is_active = Arc::clone(&state.is_active);
        let rects_arc = Arc::clone(&state.clickable_rects);
        let win = window.clone();

        std::thread::spawn(move || {
            let mut currently_ignoring = false;

            while is_active.load(Ordering::SeqCst) {
                let rects = {
                    if let Ok(guard) = rects_arc.lock() {
                        guard.clone()
                    } else {
                        Vec::new()
                    }
                };

                let is_hovering = is_mouse_over_rects(&win, &rects);

                if is_hovering && currently_ignoring {
                    let _ = win.set_ignore_cursor_events(false);
                    currently_ignoring = false;
                } else if !is_hovering && !currently_ignoring {
                    let _ = win.set_ignore_cursor_events(true);
                    currently_ignoring = true;
                }

                std::thread::sleep(std::time::Duration::from_millis(25));
            }

            let _ = win.set_ignore_cursor_events(false);
        });
    }

    Ok(())
}

#[tauri::command]
fn start_dragging_window(
    window: WebviewWindow,
    state: tauri::State<'_, ScreenStateManager>,
) -> Result<(), String> {
    if let Ok(mut lock) = state.current_dock_position.lock() {
        *lock = "custom".to_string();
    }
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_app_window(
    window: WebviewWindow,
    width: f64,
    height: f64,
    state: tauri::State<'_, ScreenStateManager>,
) -> Result<(), String> {
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|e| e.to_string())?;

    // Keep docked flush to current position on screen unless custom dragged
    let dock = {
        if let Ok(guard) = state.current_dock_position.lock() {
            guard.clone()
        } else {
            "center".to_string()
        }
    };
    if dock != "custom" {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let monitors = window.available_monitors().unwrap_or_default();
            let cur_pos = monitor.position();
            let mut cur_idx = 0;
            for (i, m) in monitors.iter().enumerate() {
                if m.position() == cur_pos {
                    cur_idx = i;
                    break;
                }
            }
            let _ = move_window_to_monitor(&window, cur_idx, &dock);
        }
    }
    Ok(())
}

#[tauri::command]
fn get_available_monitors(window: WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let current = window.current_monitor().map_err(|e| e.to_string())?;
    let current_name = current.as_ref().and_then(|m| m.name().cloned());

    let mut result = Vec::new();
    for (i, m) in monitors.into_iter().enumerate() {
        let name = m.name().cloned().or_else(|| Some(format!("Screen {}", i + 1)));
        let is_current = current_name.as_ref() == name.as_ref();
        let pos = m.position();
        let size = m.size();
        result.push(MonitorInfo {
            name,
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
            scale_factor: m.scale_factor(),
            is_current,
        });
    }
    Ok(result)
}

#[tauri::command]
fn set_screen_position(
    window: WebviewWindow,
    position: String,
    state: tauri::State<'_, ScreenStateManager>,
) -> Result<(), String> {
    if let Ok(mut lock) = state.current_dock_position.lock() {
        *lock = position.clone();
    }
    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitors = window.available_monitors().unwrap_or_default();
        let cur_pos = monitor.position();
        let mut cur_idx = 0;
        for (i, m) in monitors.iter().enumerate() {
            if m.position() == cur_pos {
                cur_idx = i;
                break;
            }
        }
        move_window_to_monitor(&window, cur_idx, &position)?;
    }
    Ok(())
}

#[tauri::command]
fn cycle_screen(
    window: WebviewWindow,
    state: tauri::State<'_, ScreenStateManager>,
) -> Result<String, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Ok("No monitors detected".to_string());
    }
    if monitors.len() == 1 {
        return Ok("Single monitor detected".to_string());
    }

    let cur_idx = get_current_monitor_index(&window).unwrap_or(0);
    let next_idx = (cur_idx + 1) % monitors.len();

    let dock = {
        if let Ok(guard) = state.current_dock_position.lock() {
            guard.clone()
        } else {
            "center".to_string()
        }
    };

    move_window_to_monitor(&window, next_idx, &dock)?;
    let name = monitors
        .get(next_idx)
        .and_then(|m| m.name().cloned())
        .unwrap_or_else(|| format!("Screen {}", next_idx + 1));
    Ok(format!("Moved to {}", name))
}

#[tauri::command]
fn move_to_monitor(
    window: WebviewWindow,
    monitor_index: usize,
    position: Option<String>,
    state: tauri::State<'_, ScreenStateManager>,
) -> Result<(), String> {
    let pos_str = if let Some(p) = position {
        if let Ok(mut lock) = state.current_dock_position.lock() {
            *lock = p.clone();
        }
        p
    } else if let Ok(guard) = state.current_dock_position.lock() {
        guard.clone()
    } else {
        "center".to_string()
    };
    move_window_to_monitor(&window, monitor_index, &pos_str)
}

#[tauri::command]
fn move_to_cursor_screen(
    window: WebviewWindow,
    state: tauri::State<'_, ScreenStateManager>,
) -> Result<String, String> {
    if let Some(cursor_idx) = get_cursor_monitor_index(&window) {
        let dock = {
            if let Ok(guard) = state.current_dock_position.lock() {
                guard.clone()
            } else {
                "center".to_string()
            }
        };
        move_window_to_monitor(&window, cursor_idx, &dock)?;
        let monitors = window.available_monitors().map_err(|e| e.to_string())?;
        let name = monitors
            .get(cursor_idx)
            .and_then(|m| m.name().cloned())
            .unwrap_or_else(|| format!("Screen {}", cursor_idx + 1));
        Ok(format!("Moved to {}", name))
    } else {
        Err("Could not detect cursor monitor".to_string())
    }
}

#[tauri::command]
fn set_auto_follow_screen(
    enabled: bool,
    state: tauri::State<'_, ScreenStateManager>,
) -> Result<(), String> {
    state.auto_follow.store(enabled, Ordering::SeqCst);
    println!("[Ghostove] Auto-follow screen set to: {}", enabled);
    Ok(())
}

#[tauri::command]
fn get_auto_follow_screen(state: tauri::State<'_, ScreenStateManager>) -> Result<bool, String> {
    Ok(state.auto_follow.load(Ordering::SeqCst))
}

#[tauri::command]
fn open_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_privacy_settings(setting_type: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let pref_url = match setting_type.as_deref() {
            Some("screen") => "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
            _ => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        };
        std::process::Command::new("open")
            .arg(pref_url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "ms-settings:privacy-microphone"])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_app_window(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn minimize_app_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn capture_screen() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        use base64::{Engine as _, engine::general_purpose};
        use std::process::Command;
        let temp_path = "/tmp/ghostove_screencap.jpg";

        // -x: silent (no shutter sound), -t jpg: JPEG format
        let status = Command::new("screencapture")
            .args(["-x", "-t", "jpg", temp_path])
            .status()
            .map_err(|e| format!("screencapture invocation failed: {}", e))?;

        if !status.success() {
            return Err("screencapture failed to capture screen".into());
        }

        let bytes = std::fs::read(temp_path)
            .map_err(|e| format!("Failed to read screenshot file: {}", e))?;

        let _ = std::fs::remove_file(temp_path);
        let b64 = general_purpose::STANDARD.encode(&bytes);
        Ok(b64)
    }
    #[cfg(target_os = "windows")]
    {
        use base64::{engine::general_purpose, Engine as _};
        use std::os::windows::process::CommandExt;
        use std::{process::Command, time::{SystemTime, UNIX_EPOCH}};

        // Windows desktop apps do not use macOS Screen Recording permissions.
        // Capture the virtual desktop through System.Drawing and return JPEG,
        // which is the format the backend's vision providers expect.
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("Could not create screenshot filename: {error}"))?
            .as_nanos();
        let screenshot_path = std::env::temp_dir().join(format!(
            "ghostove_screencap_{}_{}.jpg",
            std::process::id(),
            unique
        ));
        let escaped_path = screenshot_path.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen; $bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); try {{ $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size); $bitmap.Save('{}', [System.Drawing.Imaging.ImageFormat]::Jpeg) }} finally {{ $graphics.Dispose(); $bitmap.Dispose() }}",
            escaped_path
        );

        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            // This is a GUI application; do not flash a console window while
            // the short-lived capture helper runs.
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map_err(|error| format!("Could not start Windows screen capture: {error}"))?;
        if !output.status.success() {
            let _ = std::fs::remove_file(&screenshot_path);
            return Err("Windows screen capture failed".into());
        }

        let bytes = std::fs::read(&screenshot_path)
            .map_err(|error| format!("Could not read Windows screenshot: {error}"))?;
        let _ = std::fs::remove_file(&screenshot_path);
        Ok(general_purpose::STANDARD.encode(&bytes))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Screen capture is not supported on this platform".into())
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct SystemPermissions {
    pub microphone: bool,
    pub screen_capture: bool,
}

#[tauri::command]
fn check_system_permissions() -> Result<SystemPermissions, String> {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGPreflightScreenCaptureAccess() -> bool;
        }
        let screen_granted = unsafe { CGPreflightScreenCaptureAccess() };

        let mic_granted = unsafe {
            use objc::runtime::Class;
            if let Some(cls) = Class::get("AVCaptureDevice") {
                let str_cls = Class::get("NSString").unwrap();
                let audio_media_type: macos_types::Id =
                    msg_send![str_cls, stringWithUTF8String: b"soun\0".as_ptr()];
                let status: i64 = msg_send![cls, authorizationStatusForMediaType: audio_media_type];
                // 3 == AVAuthorizationStatusAuthorized
                status == 3
            } else {
                true
            }
        };

        println!(
            "[Ghostove Permissions] System check: microphone={}, screen_capture={}",
            mic_granted, screen_granted
        );

        Ok(SystemPermissions {
            microphone: mic_granted,
            screen_capture: screen_granted,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(SystemPermissions {
            microphone: true,
            screen_capture: true,
        })
    }
}

#[tauri::command]
fn request_screen_capture_access() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGRequestScreenCaptureAccess() -> bool;
        }
        Ok(unsafe { CGRequestScreenCaptureAccess() })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

const DEVICE_KEYRING_SERVICE: &str = "com.ghostove.desktop.device-identity";
const DEVICE_KEYRING_ACCOUNT: &str = "primary-ed25519-seed-v1";
const DEVICE_ID_KEYRING_ACCOUNT: &str = "primary-device-id-v1";
const AUTH_TOKEN_KEYRING_SERVICE: &str = "com.ghostove.desktop.auth";
const AUTH_TOKEN_KEYRING_ACCOUNT: &str = "desktop-session-token-v1";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceIdentity {
    device_id: String,
    public_key: String,
}

fn device_signing_key() -> Result<SigningKey, String> {
    let entry = keyring::Entry::new(DEVICE_KEYRING_SERVICE, DEVICE_KEYRING_ACCOUNT)
        .map_err(|error| format!("Could not access the operating-system keychain: {error}"))?;
    let seed = match entry.get_password() {
        Ok(value) => URL_SAFE_NO_PAD
            .decode(value)
            .map_err(|_| "The saved device identity is invalid. Reinstall or reset this device pairing.".to_string())?,
        Err(keyring::Error::NoEntry) => {
            let mut seed = [0u8; 32];
            getrandom::getrandom(&mut seed)
                .map_err(|error| format!("Could not generate a device key: {error}"))?;
            entry
                .set_password(&URL_SAFE_NO_PAD.encode(seed))
                .map_err(|error| format!("Could not save the device key in the operating-system keychain: {error}"))?;
            seed.to_vec()
        }
        Err(error) => return Err(format!("Could not read the device key from the operating-system keychain: {error}")),
    };
    let seed: [u8; 32] = seed
        .try_into()
        .map_err(|_| "The saved device identity has an invalid length. Reset this device pairing.".to_string())?;
    Ok(SigningKey::from_bytes(&seed))
}

#[tauri::command]
fn get_device_identity(existing_device_id: Option<String>) -> Result<DeviceIdentity, String> {
    let signing_key = device_signing_key()?;
    let public_key = URL_SAFE_NO_PAD.encode(signing_key.verifying_key().as_bytes());
    let entry = keyring::Entry::new(DEVICE_KEYRING_SERVICE, DEVICE_ID_KEYRING_ACCOUNT)
        .map_err(|error| format!("Could not access the operating-system keychain: {error}"))?;
    let device_id = match entry.get_password() {
        Ok(saved_id) => saved_id,
        Err(keyring::Error::NoEntry) => {
            let id = existing_device_id
                .filter(|value| !value.trim().is_empty() && value.len() <= 200)
                .ok_or_else(|| "The desktop device ID is missing. Restart Ghostove Desktop and pair again.".to_string())?;
            entry
                .set_password(&id)
                .map_err(|error| format!("Could not save the device ID in the operating-system keychain: {error}"))?;
            id
        }
        Err(error) => return Err(format!("Could not read the device ID from the operating-system keychain: {error}")),
    };
    Ok(DeviceIdentity {
        device_id,
        public_key,
    })
}

#[tauri::command]
fn sign_device_challenge(challenge: String) -> Result<String, String> {
    if challenge.is_empty() || challenge.len() > 512 {
        return Err("Invalid device authentication challenge.".to_string());
    }
    let signature = device_signing_key()?.sign(challenge.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(signature.to_bytes()))
}

#[tauri::command]
fn get_stored_auth_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(AUTH_TOKEN_KEYRING_SERVICE, AUTH_TOKEN_KEYRING_ACCOUNT)
        .map_err(|error| format!("Could not access the operating-system keychain: {error}"))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read the desktop session from the operating-system keychain: {error}")),
    }
}

#[tauri::command]
fn set_stored_auth_token(token: String) -> Result<(), String> {
    if token.trim().is_empty() || token.len() > 8192 {
        return Err("Invalid desktop session token.".to_string());
    }
    let entry = keyring::Entry::new(AUTH_TOKEN_KEYRING_SERVICE, AUTH_TOKEN_KEYRING_ACCOUNT)
        .map_err(|error| format!("Could not access the operating-system keychain: {error}"))?;
    entry
        .set_password(token.trim())
        .map_err(|error| format!("Could not save the desktop session in the operating-system keychain: {error}"))
}

#[tauri::command]
fn clear_stored_auth_token() -> Result<(), String> {
    let entry = keyring::Entry::new(AUTH_TOKEN_KEYRING_SERVICE, AUTH_TOKEN_KEYRING_ACCOUNT)
        .map_err(|error| format!("Could not access the operating-system keychain: {error}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove the desktop session from the operating-system keychain: {error}")),
    }
}

fn main() {
    tauri::Builder::default()
        // Keep protocol callbacks in the running app instead of opening a second
        // window/process when Windows launches a custom-scheme URL.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(dev_pairing::DevPairingState::default())
        .manage(ClickThroughManager::default())
        .manage(ScreenStateManager::default())
        .invoke_handler(tauri::generate_handler![
            enforce_screenshare_invisibility,
            set_click_through,
            set_selective_click_through,
            get_available_monitors,
            set_screen_position,
            cycle_screen,
            move_to_monitor,
            move_to_cursor_screen,
            set_auto_follow_screen,
            get_auto_follow_screen,
            open_browser,
            open_privacy_settings,
            close_app_window,
            minimize_app_window,
            resize_app_window,
            start_dragging_window,
            capture_screen,
            check_system_permissions,
            request_screen_capture_access,
            start_system_audio_capture,
            stop_system_audio_capture,
            get_device_identity,
            sign_device_challenge,
            get_stored_auth_token,
            set_stored_auth_token,
            clear_stored_auth_token,
            dev_pairing::take_dev_pairing_token
        ])
        .setup(|app| {
            let _ = SYSTEM_AUDIO_APP.set(app.handle().clone());

            #[cfg(debug_assertions)]
            if let Err(error) = dev_pairing::start(app.handle()) {
                eprintln!("[Ghostove Dev Pairing] {error}");
            }

            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(window) = app.get_webview_window("main") {
                let screen_state = app.state::<ScreenStateManager>();
                let _ = window.set_visible_on_all_workspaces(true);
                let protection = apply_screen_share_invisibility(&window);
                println!("[Ghostove] Screen-share protection status: {:?}", protection);

                #[cfg(target_os = "windows")]
                if let Ok(hwnd) = window.hwnd() {
                    follow_active_virtual_desktop(
                        hwnd.0 as usize,
                        Arc::clone(&screen_state.auto_follow),
                    );
                }

                // Ensure HUD is centered by default on launch
                let cur_mon_idx = get_current_monitor_index(&window).unwrap_or(0);
                let _ = move_window_to_monitor(&window, cur_mon_idx, "center");

                // Spawn background monitor watcher for multi-screen auto-follow
                let auto_follow = Arc::clone(&screen_state.auto_follow);
                let dock_pos = Arc::clone(&screen_state.current_dock_position);
                let win_clone = window.clone();

                std::thread::spawn(move || {
                    let mut candidate_monitor: Option<usize> = None;
                    let mut consecutive_ticks: u32 = 0;
                    let mut last_workspace_refresh = std::time::Instant::now();

                    loop {
                        std::thread::sleep(std::time::Duration::from_millis(250));

                        #[cfg(target_os = "macos")]
                        if last_workspace_refresh.elapsed() >= std::time::Duration::from_secs(2) {
                            let window = win_clone.clone();
                            let _ = win_clone.run_on_main_thread(move || {
                                ensure_visible_on_all_spaces(&window);
                            });
                            last_workspace_refresh = std::time::Instant::now();
                        }

                        if !auto_follow.load(Ordering::SeqCst) {
                            continue;
                        }

                        // If multiple physical monitors exist, check for cursor monitor transition
                        if let Ok(monitors) = win_clone.available_monitors() {
                            if monitors.len() > 1 && !is_cursor_inside_window(&win_clone) {
                                if let Some(cursor_mon_idx) = get_cursor_monitor_index(&win_clone) {
                                    let current_mon_idx = get_current_monitor_index(&win_clone);
                                    if let Some(cur_idx) = current_mon_idx {
                                        if cur_idx != cursor_mon_idx {
                                            if candidate_monitor == Some(cursor_mon_idx) {
                                                consecutive_ticks += 1;
                                                // Stayed on other monitor for 2 ticks (~500ms)
                                                if consecutive_ticks >= 2 {
                                                    let dock = {
                                                        if let Ok(guard) = dock_pos.lock() {
                                                            guard.clone()
                                                        } else {
                                                            "center".to_string()
                                                        }
                                                    };
                                                    let w = win_clone.clone();
                                                    let dock_clone = dock.clone();
                                                    let _ = win_clone.run_on_main_thread(move || {
                                                        let _ = move_window_to_monitor(&w, cursor_mon_idx, &dock_clone);
                                                    });
                                                    candidate_monitor = None;
                                                    consecutive_ticks = 0;
                                                }
                                            } else {
                                                candidate_monitor = Some(cursor_mon_idx);
                                                consecutive_ticks = 1;
                                            }
                                        } else {
                                            candidate_monitor = None;
                                            consecutive_ticks = 0;
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Ghostove desktop application");
}
