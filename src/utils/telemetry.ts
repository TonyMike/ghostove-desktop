import { WEB_API_URL } from './config';

export interface TelemetryPayload {
  userId?: string | null;
  sessionId?: string | null;
  source?: 'desktop' | 'web';
  eventType: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  status?: 'info' | 'success' | 'warning' | 'active' | 'error';
}

/**
 * Emits a real-time telemetry event to the Ghostove cluster.
 * Fails silently so it never interrupts the core interview HUD flow.
 */
export async function emitTelemetry(payload: TelemetryPayload): Promise<void> {
  const body = {
    source: payload.source || 'desktop',
    ...payload,
  };

  try {
    // 1. Try FastAPI backend telemetry endpoint
    fetch('http://localhost:8000/api/telemetry/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: body.userId,
        session_id: body.sessionId,
        source: body.source,
        event_type: body.eventType,
        title: body.title,
        description: body.description,
        metadata: body.metadata,
        status: body.status || 'info',
      }),
    }).catch(() => {
      // Fallback: try Next.js web portal endpoint
      fetch(`${WEB_API_URL}/api/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {});
    });
  } catch {
    // Graceful no-op
  }
}
