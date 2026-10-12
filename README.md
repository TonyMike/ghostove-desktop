# Ghostove Desktop 👻

> **Native, Screen-Share Invisible Stealth HUD for macOS and Windows**

Ghostove Desktop is a lightweight, low-latency Tauri v2 application providing a transparent, click-through floating overlay for live interview assistance. Operating completely outside Zoom, Microsoft Teams, and Google Meet screen capture APIs, Ghostove delivers real-time speech transcription and resume-grounded STAR method bullet points directly to your screen.

---

## ⚡ Key Features & OS Hooks

1. **Screen-Share Invisibility Protocol ([main.rs](file:///Users/tonymike/Documents/workspace/ghostove/ghostove-desktop/src-tauri/src/main.rs))**:
   - **Windows**: Calls Win32 FFI `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` (`0x00000011`). Omits HUD window from Zoom, Teams, Meet, and OBS screen sharing.
   - **macOS**: Calls Cocoa Objective-C binding `[window setSharingType:NSWindowSharingNone]` and uses `Info.plist` key `LSUIElement = true` to hide app from Dock and Cmd+Tab switcher.

2. **Deep-Link Authentication Protocol (`ghostove://`)**:
   - Configured custom protocol in `tauri.conf.json`.
   - Listens for `ghostove://auth?token=<JWT>` emitted by `ghostove-web`. Saves token in persistent storage (`tauri-plugin-store`) and automatically launches HUD overlay.

3. **Click-Through & Opacity Control ([ControlBar.tsx](file:///Users/tonymike/Documents/workspace/ghostove/ghostove-desktop/src/components/ControlBar.tsx))**:
   - **Click-Through Hotkey (`Cmd+Shift+T` / `Ctrl+Shift+T`)**: Toggles `window.set_ignore_cursor_events(true)` allowing user to click elements behind the HUD overlay.
   - **Opacity Slider**: Adjustable window opacity (20% to 100%) to blend against IDEs and dark mode code editors.
   - **Code Snip Hotkey (`Cmd+K` / `Ctrl+K`)**: Triggers code challenge screen analysis mode.

4. **Bi-Directional Audio Streaming ([useAudioCapture.ts](file:///Users/tonymike/Documents/workspace/ghostove/ghostove-desktop/src/hooks/useAudioCapture.ts))**:
   - Encodes audio into 16kHz linear16 PCM binary buffers and streams via WebSocket to `ghostove-backend`:
     `ws://localhost:8000/ws?token=<JWT>`

5. **Quota Exhausted Warning ([QuotaWarningBanner.tsx](file:///Users/tonymike/Documents/workspace/ghostove/ghostove-desktop/src/components/QuotaWarningBanner.tsx))**:
   - Displays in-HUD modal when backend sends `quota_exhausted` event with link to upgrade on Ghostove Web ($10 Pro plan).

---

## 🚀 Getting Started

### Prerequisites
- Node.js `v20+` & npm
- Rust `1.75+` (Required for Tauri v2 compilation)

### Installation & Run

```bash
# 1. Install frontend dependencies
npm install

# 2. Run in Tauri v2 development mode
npm run tauri dev
```

### Pairing the development app

When Ghostove Web is running at `http://localhost:3000`, the desktop pairing page sends the sign-in token to the development app's loopback bridge at `127.0.0.1:1422`. Keep `npm run tauri dev` running and leave port `1422` available. Pairing from the production website continues to use the `ghostove://` protocol.

---

## 📦 Project Structure

```
ghostove-desktop/
├── src-tauri/
│   ├── Cargo.toml                  # Rust dependencies & OS FFI crates
│   ├── build.rs                    # Tauri build script
│   ├── tauri.conf.json             # Window transparency, deep-link & plugin configuration
│   ├── Info.plist                  # macOS LSUIElement stealth mode configuration
│   └── src/
│       └── main.rs                 # SetWindowDisplayAffinity & setSharingType native hooks
├── src/
│   ├── App.tsx                     # Main router & token validator
│   ├── components/
│   │   ├── AuthScreen.tsx          # "Authentication Required" & pairing view
│   │   ├── HUDOverlay.tsx          # Floating HUD layout container
│   │   ├── TopBar.tsx              # Connection status & trial timer
│   │   ├── TranscriptBox.tsx       # Real-time rolling transcript stream
│   │   ├── AISuggestionsPanel.tsx  # Claude 3.5 Sonnet STAR method talking points
│   │   ├── QuotaWarningBanner.tsx  # Quota exhausted in-HUD alert
│   │   └── ControlBar.tsx          # Opacity slider, click-through & code snip hotkey
│   ├── hooks/
│   │   ├── useAudioCapture.ts      # 16kHz linear16 PCM audio encoder
│   │   ├── useWebSocketStream.ts   # WebSocket streaming client
│   │   └── useDeepLink.ts          # ghostove:// protocol handler
│   └── utils/
│       ├── store.ts                # Persistent token store
│       └── pcmEncoder.ts           # Float32 to Int16 PCM converter
├── package.json
├── vite.config.ts
└── README.md
```
