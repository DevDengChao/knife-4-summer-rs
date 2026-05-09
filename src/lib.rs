//! Knife4j-style OpenAPI documentation routes for summer-rs and aide.

use std::sync::Arc;

use aide::axum::ApiRouter;
use aide::openapi::OpenApi;
use axum::extract::Path;
use axum::http::{header, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::{Extension, Json};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use summer::app::AppBuilder;
use summer::config::{ConfigRegistry, Configurable};
use summer::plugin::Plugin;
use summer_web::WebConfigurator;

const DEFAULT_DOC_PATH: &str = "/doc";
const DEFAULT_DOC_HTML_PATH: &str = "/doc.html";
const DEFAULT_ASSETS_PATH: &str = "/_knife4j";
const DEFAULT_API_DOCS_PATH: &str = "/v3/api-docs";
const DEFAULT_GROUP_NAME: &str = "default";

/// Configuration for the Knife4j-compatible documentation module.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Knife4jConfig {
    #[serde(default = "default_doc_path")]
    pub doc_path: String,
    #[serde(default = "default_doc_html_path")]
    pub doc_html_path: String,
    #[serde(default = "default_assets_path")]
    pub assets_path: String,
    #[serde(default = "default_api_docs_path")]
    pub api_docs_path: String,
    #[serde(default = "default_group_name")]
    pub group_name: String,
    #[serde(default)]
    pub groups: Vec<Knife4jGroup>,
}

impl Default for Knife4jConfig {
    fn default() -> Self {
        Self {
            doc_path: default_doc_path(),
            doc_html_path: default_doc_html_path(),
            assets_path: default_assets_path(),
            api_docs_path: default_api_docs_path(),
            group_name: default_group_name(),
            groups: Vec::new(),
        }
    }
}

impl Configurable for Knife4jConfig {
    fn config_prefix() -> &'static str {
        "knife4j"
    }
}

impl Knife4jConfig {
    /// Normalize URL paths and ensure the default API group is present.
    pub fn normalized(mut self) -> Self {
        normalize_path(&mut self.doc_path, DEFAULT_DOC_PATH);
        normalize_path(&mut self.doc_html_path, DEFAULT_DOC_HTML_PATH);
        normalize_path(&mut self.assets_path, DEFAULT_ASSETS_PATH);
        normalize_path(&mut self.api_docs_path, DEFAULT_API_DOCS_PATH);

        for group in &mut self.groups {
            normalize_optional_path(&mut group.url);
            normalize_optional_path(&mut group.location);
        }

        if self.groups.is_empty() {
            self.groups.push(Knife4jGroup {
                name: self.group_name.clone(),
                url: self.api_docs_path.trim_start_matches('/').to_string(),
                location: self.api_docs_path.trim_start_matches('/').to_string(),
                swagger_version: "3.0.3".to_string(),
            });
        }

        self
    }
}

/// One OpenAPI document entry exposed to Knife4j discovery endpoints.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Knife4jGroup {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub location: String,
    #[serde(default = "default_swagger_version")]
    pub swagger_version: String,
}

impl Knife4jGroup {
    fn normalized_location(&self) -> &str {
        if self.location.is_empty() {
            &self.url
        } else {
            &self.location
        }
    }
}

/// Build Knife4j-compatible routes for direct `aide` / `axum` users.
pub fn knife4j_router(config: Knife4jConfig) -> ApiRouter {
    let config = Arc::new(config.normalized());
    let doc_path = config.doc_path.clone();
    let doc_html_path = config.doc_html_path.clone();
    let assets_route = format!("{}/{{*asset}}", config.assets_path);
    let api_docs_path = config.api_docs_path.clone();

    ApiRouter::new()
        .route(&doc_html_path, axum::routing::get(serve_index))
        .route(&doc_path, axum::routing::get(serve_index))
        .route(&assets_route, axum::routing::get(serve_asset))
        .route(&api_docs_path, axum::routing::get(serve_openapi))
        .route(
            "/v3/api-docs/swagger-config",
            axum::routing::get({
                let config = Arc::clone(&config);
                move || swagger_config(Arc::clone(&config))
            }),
        )
        .route(
            "/swagger-resources",
            axum::routing::get({
                let config = Arc::clone(&config);
                move || swagger_resources(Arc::clone(&config))
            }),
        )
        .route(
            "/swagger-resources/configuration/ui",
            axum::routing::get(swagger_ui_config),
        )
        .route(
            "/swagger-resources/configuration/security",
            axum::routing::get(swagger_security_config),
        )
        .route(
            "/services.json",
            axum::routing::get({
                let config = Arc::clone(&config);
                move || services_json(Arc::clone(&config))
            }),
        )
}

/// Immediate summer-rs plugin that registers Knife4j routes before `WebPlugin`.
pub struct Knife4jPlugin;

#[summer::async_trait]
impl Plugin for Knife4jPlugin {
    fn immediately_build(&self, app: &mut AppBuilder) {
        let config = app.get_config::<Knife4jConfig>().unwrap_or_default();
        app.add_router(knife4j_router(config));
    }

    fn immediately(&self) -> bool {
        true
    }

    fn name(&self) -> &str {
        "Knife4jPlugin"
    }
}

async fn serve_index() -> impl IntoResponse {
    Html(index_html())
}

async fn serve_asset(Path(asset): Path<String>) -> Response {
    let nuxt_asset = format!("_knife4j/{asset}");
    match StaticAssets::get(asset.as_str()).or_else(|| StaticAssets::get(nuxt_asset.as_str())) {
        Some(file) => {
            let mime = mime_guess::from_path(&asset).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], file.data).into_response()
        }
        None => (StatusCode::NOT_FOUND, "404 Not Found").into_response(),
    }
}

async fn serve_openapi(Extension(api): Extension<Arc<OpenApi>>) -> impl IntoResponse {
    Json(serde_json::to_value(api.as_ref()).expect("OpenAPI document should serialize"))
}

async fn swagger_config(config: Arc<Knife4jConfig>) -> impl IntoResponse {
    Json(SwaggerConfigResponse {
        config_url: "/v3/api-docs/swagger-config".to_string(),
        urls: config
            .groups
            .iter()
            .map(|group| NamedUrl {
                name: group.name.clone(),
                url: group.url.clone(),
            })
            .collect(),
        validator_url: String::new(),
    })
}

async fn swagger_resources(config: Arc<Knife4jConfig>) -> impl IntoResponse {
    Json(
        config
            .groups
            .iter()
            .map(|group| SwaggerResource {
                name: group.name.clone(),
                url: group.url.clone(),
                location: group.normalized_location().to_string(),
                swagger_version: group.swagger_version.clone(),
            })
            .collect::<Vec<_>>(),
    )
}

async fn swagger_ui_config() -> impl IntoResponse {
    Json(serde_json::json!({
        "deepLinking": true,
        "displayOperationId": false,
        "defaultModelsExpandDepth": 1,
        "defaultModelExpandDepth": 1,
        "docExpansion": "none",
        "operationsSorter": "alpha",
        "tagsSorter": "alpha"
    }))
}

async fn swagger_security_config() -> impl IntoResponse {
    Json(Vec::<serde_json::Value>::new())
}

async fn services_json(config: Arc<Knife4jConfig>) -> impl IntoResponse {
    Json(
        config
            .groups
            .iter()
            .map(|group| ServiceResource {
                name: group.name.clone(),
                url: group.url.clone(),
                swagger_version: group.swagger_version.clone(),
            })
            .collect::<Vec<_>>(),
    )
}

fn index_html() -> String {
    let html = StaticAssets::get("index.html")
        .expect("assets/knife4j/index.html must be generated before compiling");
    String::from_utf8_lossy(&html.data).into_owned()
}

#[derive(Embed)]
#[folder = "assets/knife4j/"]
struct StaticAssets;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SwaggerConfigResponse {
    config_url: String,
    urls: Vec<NamedUrl>,
    validator_url: String,
}

#[derive(Debug, Serialize)]
struct NamedUrl {
    name: String,
    url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SwaggerResource {
    name: String,
    url: String,
    location: String,
    swagger_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceResource {
    name: String,
    url: String,
    swagger_version: String,
}

fn normalize_path(path: &mut String, fallback: &str) {
    if path.trim().is_empty() {
        *path = fallback.to_string();
    }
    if !path.starts_with('/') {
        path.insert(0, '/');
    }
    while path.len() > 1 && path.ends_with('/') {
        path.pop();
    }
}

fn normalize_optional_path(path: &mut String) {
    if path.trim().is_empty() {
        return;
    }
    let absolute = path.starts_with('/');
    normalize_path(path, "");
    if !absolute {
        *path = path.trim_start_matches('/').to_string();
    }
}

fn default_doc_path() -> String {
    DEFAULT_DOC_PATH.to_string()
}

fn default_doc_html_path() -> String {
    DEFAULT_DOC_HTML_PATH.to_string()
}

fn default_assets_path() -> String {
    DEFAULT_ASSETS_PATH.to_string()
}

fn default_api_docs_path() -> String {
    DEFAULT_API_DOCS_PATH.to_string()
}

fn default_group_name() -> String {
    DEFAULT_GROUP_NAME.to_string()
}

fn default_swagger_version() -> String {
    "3.0.3".to_string()
}
