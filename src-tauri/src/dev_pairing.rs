use std::sync::{Arc, Mutex};

#[cfg(debug_assertions)]
use serde::Deserialize;
use tauri::State;
#[cfg(debug_assertions)]
use tauri::{AppHandle, Emitter, Manager};

#[cfg(debug_assertions)]
const BRIDGE_ADDRESS: &str = "127.0.0.1:1422";
#[cfg(debug_assertions)]
const PAIRING_EVENT: &str = "dev-pairing-token";
#[cfg(debug_assertions)]
const MAX_BODY_BYTES: usize = 16 * 1024;
#[cfg(any(debug_assertions, test))]
const ALLOWED_ORIGINS: [&str; 2] = ["http://localhost:3000", "http://127.0.0.1:3000"];

#[derive(Clone, Default)]
pub struct DevPairingState(Arc<Mutex<Option<String>>>);

#[cfg(debug_assertions)]
#[derive(Deserialize)]
struct PairingRequest {
    token: String,
}

impl DevPairingState {
    #[cfg(debug_assertions)]
    fn put(&self, token: String) {
        if let Ok(mut pending) = self.0.lock() {
            *pending = Some(token);
        }
    }

    pub fn take(&self) -> Option<String> {
        self.0.lock().ok().and_then(|mut pending| pending.take())
    }
}

#[cfg(any(debug_assertions, test))]
pub fn is_allowed_origin(origin: &str) -> bool {
    ALLOWED_ORIGINS.contains(&origin)
}

#[tauri::command]
pub fn take_dev_pairing_token(state: State<'_, DevPairingState>) -> Option<String> {
    state.take()
}

#[cfg(debug_assertions)]
pub fn start(app: &AppHandle) -> Result<(), String> {
    use hyper::server::conn::http1;
    use hyper::service::service_fn;
    use hyper_util::rt::TokioIo;
    use tokio::net::TcpListener;

    let listener = std::net::TcpListener::bind(BRIDGE_ADDRESS).map_err(|error| {
        format!("Could not bind development pairing bridge on {BRIDGE_ADDRESS}: {error}")
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Could not configure development pairing bridge: {error}"))?;

    let app = app.clone();
    let pending = app.state::<DevPairingState>().inner().clone();
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("[Ghostove Dev Pairing] Could not start bridge: {error}");
                return;
            }
        };

        println!("[Ghostove Dev Pairing] Listening on {BRIDGE_ADDRESS}");
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(connection) => connection,
                Err(error) => {
                    eprintln!("[Ghostove Dev Pairing] Accept failed: {error}");
                    continue;
                }
            };

            let app = app.clone();
            let pending = pending.clone();
            tauri::async_runtime::spawn(async move {
                let service = service_fn(move |request| {
                    let app = app.clone();
                    let pending = pending.clone();
                    async move {
                        Ok::<_, std::convert::Infallible>(
                            handle_request(request, app, pending).await,
                        )
                    }
                });
                if let Err(error) = http1::Builder::new()
                    .serve_connection(TokioIo::new(stream), service)
                    .await
                {
                    // Do not include request data here; pairing tokens must never enter logs.
                    eprintln!("[Ghostove Dev Pairing] Request handling failed: {error}");
                }
            });
        }
    });

    Ok(())
}

#[cfg(debug_assertions)]
async fn handle_request(
    request: hyper::Request<hyper::body::Incoming>,
    app: AppHandle,
    pending: DevPairingState,
) -> hyper::Response<http_body_util::Full<bytes::Bytes>> {
    use http_body_util::{BodyExt, Limited};
    use hyper::{header, Method, StatusCode};

    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    let allowed_origin = origin.filter(|value| is_allowed_origin(value));

    if request.uri().path() != "/pair" {
        return bridge_response(
            StatusCode::NOT_FOUND,
            "{\"error\":\"Not found\"}",
            allowed_origin,
        );
    }
    if allowed_origin.is_none() {
        return bridge_response(
            StatusCode::FORBIDDEN,
            "{\"error\":\"Origin is not allowed\"}",
            None,
        );
    }

    if request.method() == Method::OPTIONS {
        let requested_method = request
            .headers()
            .get(header::ACCESS_CONTROL_REQUEST_METHOD)
            .and_then(|value| value.to_str().ok());
        let requested_headers = request
            .headers()
            .get(header::ACCESS_CONTROL_REQUEST_HEADERS)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .split(',')
            .map(|value| value.trim().to_ascii_lowercase())
            .collect::<Vec<_>>();
        if requested_method != Some("POST")
            || !requested_headers
                .iter()
                .any(|value| value == "content-type")
            || !requested_headers
                .iter()
                .any(|value| value == "x-ghostove-pairing")
        {
            return bridge_response(
                StatusCode::FORBIDDEN,
                "{\"error\":\"Invalid preflight request\"}",
                allowed_origin,
            );
        }

        return preflight_response(allowed_origin.unwrap_or_default());
    }

    if request.method() != Method::POST {
        return bridge_response(
            StatusCode::METHOD_NOT_ALLOWED,
            "{\"error\":\"Use POST\"}",
            allowed_origin,
        );
    }
    let host_is_local = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|host| host == "127.0.0.1:1422" || host == "localhost:1422");
    if !host_is_local {
        return bridge_response(
            StatusCode::FORBIDDEN,
            "{\"error\":\"Invalid host\"}",
            allowed_origin,
        );
    }
    let content_type_is_json = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value.split(';').next().unwrap_or_default().trim() == "application/json"
        });
    let pairing_header_is_valid = request
        .headers()
        .get("x-ghostove-pairing")
        .and_then(|value| value.to_str().ok())
        == Some("1");
    if !content_type_is_json || !pairing_header_is_valid {
        return bridge_response(
            StatusCode::BAD_REQUEST,
            "{\"error\":\"Invalid pairing request\"}",
            allowed_origin,
        );
    }

    let response_origin = allowed_origin.map(str::to_owned);
    let body = match Limited::new(request.into_body(), MAX_BODY_BYTES)
        .collect()
        .await
    {
        Ok(body) => body.to_bytes(),
        Err(_) => {
            return bridge_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                "{\"error\":\"Request is too large\"}",
                response_origin.as_deref(),
            )
        }
    };
    let payload = match serde_json::from_slice::<PairingRequest>(&body) {
        Ok(payload) if !payload.token.is_empty() => payload,
        _ => {
            return bridge_response(
                StatusCode::BAD_REQUEST,
                "{\"error\":\"A pairing token is required\"}",
                response_origin.as_deref(),
            )
        }
    };

    pending.put(payload.token.clone());
    let _ = app.emit(PAIRING_EVENT, payload.token);
    response(
        StatusCode::OK,
        "{\"success\":true}",
        response_origin.as_deref(),
    )
}

#[cfg(debug_assertions)]
fn preflight_response(origin: &str) -> hyper::Response<http_body_util::Full<bytes::Bytes>> {
    use bytes::Bytes;
    use http_body_util::Full;
    use hyper::{header, Response, StatusCode};

    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin)
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "POST, OPTIONS")
        .header(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            "content-type, x-ghostove-pairing",
        )
        .header(header::ACCESS_CONTROL_MAX_AGE, "300")
        .header(header::VARY, "Origin")
        .body(Full::new(Bytes::new()))
        .expect("static pairing preflight response is valid")
}

#[cfg(debug_assertions)]
fn bridge_response(
    status: hyper::StatusCode,
    message: &'static str,
    origin: Option<&str>,
) -> hyper::Response<http_body_util::Full<bytes::Bytes>> {
    response(status, message, origin)
}

#[cfg(debug_assertions)]
fn response(
    status: hyper::StatusCode,
    body: &'static str,
    origin: Option<&str>,
) -> hyper::Response<http_body_util::Full<bytes::Bytes>> {
    use bytes::Bytes;
    use http_body_util::Full;
    use hyper::{header, Response};

    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "no-store");
    if let Some(origin) = origin {
        builder = builder
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin)
            .header(header::VARY, "Origin")
            .header(
                header::ACCESS_CONTROL_EXPOSE_HEADERS,
                "x-ghostove-dev-bridge",
            )
            .header("x-ghostove-dev-bridge", "1");
    }
    builder
        .body(Full::new(Bytes::from(body)))
        .expect("static pairing response is valid")
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_origin, response, DevPairingState};
    use hyper::StatusCode;

    #[test]
    fn only_known_local_web_origins_are_allowed() {
        assert!(is_allowed_origin("http://localhost:3000"));
        assert!(is_allowed_origin("http://127.0.0.1:3000"));
        assert!(!is_allowed_origin("https://ghostove-web.vercel.app"));
        assert!(!is_allowed_origin("http://localhost:3001"));
        assert!(!is_allowed_origin("null"));
    }

    #[test]
    fn pending_pairing_token_is_consumed_once() {
        let state = DevPairingState::default();
        state.put("test-token".to_string());
        assert_eq!(state.take().as_deref(), Some("test-token"));
        assert_eq!(state.take(), None);
    }

    #[test]
    fn bridge_response_is_identifiable_only_for_allowed_cors_origins() {
        let allowed = response(
            StatusCode::OK,
            "{\"success\":true}",
            Some("http://localhost:3000"),
        );
        assert_eq!(allowed.headers().get("x-ghostove-dev-bridge").unwrap(), "1");
        assert_eq!(
            allowed
                .headers()
                .get("access-control-allow-origin")
                .unwrap(),
            "http://localhost:3000"
        );

        let rejected = response(StatusCode::FORBIDDEN, "{}", None);
        assert!(rejected.headers().get("x-ghostove-dev-bridge").is_none());
        assert!(rejected
            .headers()
            .get("access-control-allow-origin")
            .is_none());
    }
}
