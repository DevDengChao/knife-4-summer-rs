use std::sync::Arc;

use aide::axum::routing::get_with;
use aide::axum::ApiRouter;
use aide::openapi::{Info, OpenApi};
use axum::{Extension, Json};
use knife_4_summer_rs::{knife4j_router, Knife4jConfig};
use schemars::JsonSchema;
use serde::Serialize;

#[derive(Debug, Serialize, JsonSchema)]
struct User {
    id: u64,
    name: String,
}

async fn get_user() -> Json<User> {
    Json(User {
        id: 1,
        name: "summer".to_string(),
    })
}

#[tokio::main]
async fn main() {
    let mut api = OpenApi {
        info: Info {
            title: "Aide Axum Knife4j Example".to_string(),
            version: "0.1.0".to_string(),
            description: Some("Direct aide/axum integration with knife-4-summer-rs.".to_string()),
            ..Default::default()
        },
        ..Default::default()
    };

    let api_router = ApiRouter::new()
        .api_route(
            "/api/user",
            get_with(get_user, |op| op.response::<200, Json<User>>()),
        )
        .merge(knife4j_router(Knife4jConfig::default()));

    let app = api_router
        .finish_api(&mut api)
        .layer(Extension(Arc::new(api)));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8091")
        .await
        .expect("bind 127.0.0.1:8091");

    println!("Knife4j docs: http://127.0.0.1:8091/doc.html");
    axum::serve(listener, app.into_make_service())
        .await
        .expect("serve aide example");
}
