use knife_4_summer_rs::Knife4jPlugin;
use schemars::JsonSchema;
use serde::Serialize;
use summer::{auto_config, App};
use summer_web::axum::Json;
use summer_web::{get_api, WebConfigurator, WebPlugin};

#[auto_config(WebConfigurator)]
#[tokio::main]
async fn main() {
    App::new()
        .use_config_file("examples/summer-openapi-example/config/app.toml")
        .add_plugin(Knife4jPlugin)
        .add_plugin(WebPlugin)
        .run()
        .await;
}

#[derive(Debug, Serialize, JsonSchema)]
struct Health {
    status: String,
    framework: String,
}

#[get_api("/health")]
async fn health() -> Json<Health> {
    Json(Health {
        status: "ok".to_string(),
        framework: "summer-rs".to_string(),
    })
}
