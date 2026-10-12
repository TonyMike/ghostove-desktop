import { useEffect } from 'react';

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
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function initDeepLink() {
      try {
        const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
        unlisten = await onOpenUrl((urls) => {
          console.log('[DeepLink] Received URL event:', urls.length);
          for (const urlStr of urls) {
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

              const payload: DeepLinkPayload = {
                token,
                sessionId,
                action,
                rawUrl: urlStr,
              };

              console.log('[DeepLink] Extracted payload:', payload);

              if (onDeepLink) {
                onDeepLink(payload);
              }

              if (token && onTokenReceived) {
                onTokenReceived(token);
              }
            } catch (e) {
              // Fallback regex parsing
              const tokenMatch = urlStr.match(/token=([^&]+)/);
              const sessionMatch = urlStr.match(/(?:session_id|id)=([^&]+)/);
              const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : undefined;
              const sessionId = sessionMatch ? decodeURIComponent(sessionMatch[1]) : undefined;

              const payload: DeepLinkPayload = {
                token,
                sessionId,
                action: urlStr.includes('start-session') ? 'start-session' : 'open',
                rawUrl: urlStr,
              };

              if (onDeepLink) {
                onDeepLink(payload);
              }

              if (token && onTokenReceived) {
                onTokenReceived(token);
              }
            }
          }
        });
      } catch (err) {
        console.warn('[DeepLink] Plugin not initialized in standard web browser mode:', err);
      }
    }

    initDeepLink();

    return () => {
      if (unlisten) unlisten();
    };
  }, [onTokenReceived, onDeepLink]);
}
