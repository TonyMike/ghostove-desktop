const isProd = import.meta.env.PROD;

export const BACKEND_API_URL =
  import.meta.env.VITE_BACKEND_API_URL ||
  (isProd
    ? 'https://ghostove-backend-production.up.railway.app'
    : 'http://localhost:8000');

export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  import.meta.env.VITE_GHOSTOVE_BACKEND_WS ||
  (isProd
    ? 'wss://ghostove-backend-production.up.railway.app/ws'
    : 'ws://localhost:8000/ws');

export const WEB_API_URL =
  import.meta.env.VITE_WEB_API_URL ||
  (isProd ? 'https://ghostove-web.tee-jhay1.workers.dev' : 'http://localhost:3000');
