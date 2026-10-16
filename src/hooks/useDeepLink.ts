import { useEffect, useRef } from 'react';

export interface DeepLinkPayload {
  token?: string;
  sessionId?: string;
  action?: string;
  rawUrl: string;
}

interface UseDeepLinkProps {
  onTokenReceived?: (token: string) => void;
  onDeepLink?: (payload: DeepLinkPayload) => void;
}

export function useDeepLink({ onTokenReceived, onDeepLink }: UseDeepLinkProps) {
  const onTokenReceivedRef = useRef(onTokenReceived);
  const onDeepLinkRef = useRef(onDeepLink);

  onTokenReceivedRef.current = onTokenReceived;
  onDeepLinkRef.current = onDeepLink;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const recentlyHandledUrls = new Map<string, number>();

    const handleUrls = (urls: string[]) => {
      for (const urlStr of urls) {
        const now = Date.now();
        const handledAt = recentlyHandledUrls.get(urlStr);
        if (handledAt && now - handledAt < 2000) continue;
        recentlyHandledUrls.set(urlStr, now);
        for (const [handledUrl, timestamp] of recentlyHandledUrls) {
          if (now - timestamp >= 2000) recentlyHandledUrls.delete(handledUrl);
        }

        try {
          // Normalize custom protocol for URL parsing
          const normalized = urlStr.replace('ghostove://', 'http://ghostove.local/');
          const parsed = new URL(normalized);

          const token = parsed.searchParams.get('token') || undefined;
          const sessionId =
            parsed.searchParams.get('session_id') ||
            parsed.searchParams.get('id') ||
            undefined;
          const action =
            parsed.pathname.replace(/^\//, '') ||
            parsed.searchParams.get('action') ||
            (urlStr.includes('start-session') ? 'start-session' : 'open');

          const payload: DeepLinkPayload = { token, sessionId, action, rawUrl: urlStr };
          console.log('[DeepLink] Extracted payload:', {
            ...payload,
            token: token ? '[REDACTED]' : undefined,
          });
          onDeepLinkRef.current?.(payload);
          if (token) onTokenReceivedRef.current?.(token);
        } catch {
          // Fallback for custom URL forms that the URL constructor cannot parse.
          const tokenMatch = urlStr.match(/[?&]token=([^&]+)/);
          const sessionMatch = urlStr.match(/[?&](?:session_id|id)=([^&]+)/);
          const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : undefined;
          const sessionId = sessionMatch ? decodeURIComponent(sessionMatch[1]) : undefined;
          const payload: DeepLinkPayload = {
            token,
            sessionId,
            action: urlStr.includes('start-session') ? 'start-session' : 'open',
            rawUrl: urlStr,
          };
          onDeepLinkRef.current?.(payload);
          if (token) onTokenReceivedRef.current?.(token);
        }
      }
    };

    async function initDeepLink() {
      try {
        const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
        unlisten = await onOpenUrl((urls) => {
          console.log('[DeepLink] Received URL event:', urls.length);
          handleUrls(urls);
        });

        // Windows (and a cold launch on any platform) delivers the URL before
        // the webview listener mounts. Read it after subscribing to avoid a gap.
        const startUrls = await getCurrent();
        if (startUrls?.length) handleUrls(startUrls);
      } catch (err) {
        console.warn('[DeepLink] Plugin not initialized in standard web browser mode:', err);
      }
    }

    initDeepLink();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);
}
