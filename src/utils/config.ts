const isProd = import.meta.env.PROD;

function getUrl(value: string | undefined, variableName: string, devFallback: string) {
  if (value) return value;
  if (isProd) {
    throw new Error(`Missing required production environment variable: ${variableName}`);
  }
  return devFallback;
}

export const BACKEND_API_URL = getUrl(
  import.meta.env.VITE_BACKEND_API_URL,
  'VITE_BACKEND_API_URL',
  'http://localhost:8000',
);

export const WS_URL = getUrl(
  import.meta.env.VITE_WS_URL || import.meta.env.VITE_GHOSTOVE_BACKEND_WS,
  'VITE_WS_URL',
  'ws://localhost:8000/ws',
);

export const WEB_API_URL = getUrl(
  import.meta.env.VITE_WEB_API_URL,
  'VITE_WEB_API_URL',
  'http://localhost:3000',
);
