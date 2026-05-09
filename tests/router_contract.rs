use std::sync::Arc;

use aide::openapi::{Info, OpenApi};
use axum::{body::Body, Extension};
use http_body_util::BodyExt;
use knife_4_summer_rs::{knife4j_router, Knife4jConfig, Knife4jGroup, Knife4jPlugin};
use summer::app::AppBuilder;
use summer::plugin::ComponentRegistry;
use summer_web::Routers;
use tower::ServiceExt;

fn test_openapi() -> OpenApi {
    OpenApi {
        info: Info {
            title: "Knife4j Test API".into(),
            version: "1.0.0".into(),
            ..Default::default()
        },
        ..Default::default()
    }
}

async fn body_text(response: axum::response::Response) -> String {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    String::from_utf8(bytes.to_vec()).expect("body should be utf-8")
}

#[tokio::test]
async fn serves_doc_entry_from_doc_html_and_doc_paths() {
    let app = knife4j_router(Knife4jConfig::default()).layer(Extension(Arc::new(test_openapi())));

    for path in ["/doc.html", "/doc"] {
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri(path)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_eq!(
            response.headers()["content-type"],
            "text/html; charset=utf-8"
        );
        let body = body_text(response).await;
        assert!(body.contains("__nuxt"));
        assert!(body.contains("/_knife4j/"));
    }
}

#[tokio::test]
async fn serves_generated_nuxt_assets_under_default_assets_path() {
    let app = knife4j_router(Knife4jConfig::default()).layer(Extension(Arc::new(test_openapi())));

    let index = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .uri("/doc.html")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let html = body_text(index).await;
    let asset_path = html
        .split("\"/_knife4j/")
        .nth(1)
        .expect("generated html should reference a Nuxt asset")
        .split('"')
        .next()
        .expect("asset path should end at quote");

    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri(format!("/_knife4j/{asset_path}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
}

#[tokio::test]
async fn exposes_springdoc_and_knife4j_discovery_contracts() {
    let app = knife4j_router(Knife4jConfig::default()).layer(Extension(Arc::new(test_openapi())));

    let swagger_config = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .uri("/v3/api-docs/swagger-config")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(swagger_config.status(), axum::http::StatusCode::OK);
    let swagger_config: serde_json::Value =
        serde_json::from_str(&body_text(swagger_config).await).unwrap();
    assert_eq!(swagger_config["urls"][0]["name"], "default");
    assert_eq!(swagger_config["urls"][0]["url"], "v3/api-docs");

    let swagger_resources = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .uri("/swagger-resources")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(swagger_resources.status(), axum::http::StatusCode::OK);
    let swagger_resources: serde_json::Value =
        serde_json::from_str(&body_text(swagger_resources).await).unwrap();
    assert_eq!(swagger_resources[0]["name"], "default");
    assert_eq!(swagger_resources[0]["location"], "v3/api-docs");

    let services = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/services.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(services.status(), axum::http::StatusCode::OK);
    let services: serde_json::Value = serde_json::from_str(&body_text(services).await).unwrap();
    assert_eq!(services[0]["swaggerVersion"], "3.0.3");
    assert_eq!(services[0]["url"], "v3/api-docs");
}

#[tokio::test]
async fn serves_openapi_json_from_axum_extension() {
    let app = knife4j_router(Knife4jConfig::default()).layer(Extension(Arc::new(test_openapi())));

    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/v3/api-docs")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let json: serde_json::Value = serde_json::from_str(&body_text(response).await).unwrap();
    assert_eq!(json["info"]["title"], "Knife4j Test API");
    assert_eq!(json["info"]["version"], "1.0.0");
}

#[tokio::test]
async fn normalizes_custom_config_and_exposes_multiple_groups() {
    let config = Knife4jConfig {
        doc_path: "knife-doc/".into(),
        doc_html_path: "knife.html".into(),
        assets_path: "knife-assets/".into(),
        api_docs_path: "api-docs".into(),
        group_name: "ignored-when-groups-exist".into(),
        groups: vec![
            Knife4jGroup {
                name: "local".into(),
                url: "api-docs".into(),
                location: String::new(),
                swagger_version: "3.0.3".into(),
            },
            Knife4jGroup {
                name: "petstore".into(),
                url: "https://petstore.swagger.io/v2/swagger.json".into(),
                location: "https://petstore.swagger.io/v2/swagger.json".into(),
                swagger_version: "2.0".into(),
            },
        ],
    };
    let app = knife4j_router(config).layer(Extension(Arc::new(test_openapi())));

    let doc = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .uri("/knife-doc")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(doc.status(), axum::http::StatusCode::OK);

    let swagger_config = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/v3/api-docs/swagger-config")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let swagger_config: serde_json::Value =
        serde_json::from_str(&body_text(swagger_config).await).unwrap();
    assert_eq!(swagger_config["urls"][0]["url"], "api-docs");
    assert_eq!(
        swagger_config["urls"][1]["url"],
        "https://petstore.swagger.io/v2/swagger.json"
    );
}

#[test]
fn plugin_registers_router_immediately_for_summer_web() {
    let mut app = AppBuilder::default();

    app.add_plugin(Knife4jPlugin);

    let routers = app
        .get_component::<Routers>()
        .expect("Knife4jPlugin should register a summer-web router immediately");
    assert_eq!(routers.len(), 1);
}
