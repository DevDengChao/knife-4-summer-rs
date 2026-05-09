# knife-4-summer-rs

Knife4j-style OpenAPI documentation plugin for `summer-rs` and direct `aide` / `axum` applications.

The crate serves a Nuxt-generated static UI at both `/doc.html` and `/doc`, and exposes Knife4j-compatible discovery endpoints:

- `/v3/api-docs`
- `/v3/api-docs/swagger-config`
- `/swagger-resources`
- `/swagger-resources/configuration/ui`
- `/swagger-resources/configuration/security`
- `/services.json`

## summer-rs

```rust
use knife_4_summer_rs::Knife4jPlugin;
use summer::App;
use summer_web::WebPlugin;

#[tokio::main]
async fn main() {
    App::new()
        .add_plugin(Knife4jPlugin)
        .add_plugin(WebPlugin)
        .run()
        .await;
}
```

`Knife4jPlugin` is an immediate plugin, so register it before `WebPlugin`.

## aide / axum

```rust
use std::sync::Arc;

use aide::axum::ApiRouter;
use aide::openapi::OpenApi;
use axum::Extension;
use knife_4_summer_rs::{knife4j_router, Knife4jConfig};

let mut api = OpenApi::default();
let app = ApiRouter::new()
    .merge(knife4j_router(Knife4jConfig::default()))
    .finish_api(&mut api)
    .layer(Extension(Arc::new(api)));
```

## Configuration

The summer-rs config prefix is `[knife4j]`.

```toml
[knife4j]
doc_path = "/doc"
doc_html_path = "/doc.html"
assets_path = "/_knife4j"
api_docs_path = "/v3/api-docs"
group_name = "default"

[[knife4j.groups]]
name = "Petstore v2"
url = "https://petstore.swagger.io/v2/swagger.json"
location = "https://petstore.swagger.io/v2/swagger.json"
swagger_version = "2.0"
```

## Frontend

The UI is implemented from scratch in `frontend/` with Nuxt, UnoCSS, Prettier, and ESLint.

```powershell
pnpm --dir frontend install
pnpm --dir frontend test
pnpm --dir frontend lint
pnpm --dir frontend format
pnpm --dir frontend generate
```

After `generate`, copy `frontend/.output/public` into `assets/knife4j` before publishing the Rust crate.

## Examples

```powershell
cargo run -p knife4j-summer-openapi-example
cargo run -p knife4j-aide-axum-example
cargo run -p knife4j-petstore-example
```

Open the printed `/doc.html` or `/doc` URL.
