# knife-4-summer-rs

[![Crates.io](https://img.shields.io/crates/v/knife-4-summer-rs.svg)](https://crates.io/crates/knife-4-summer-rs)

Knife4j-style OpenAPI documentation plugin for `summer-rs` and direct `aide` / `axum` applications.

![Knife4j Petstore preview](https://raw.githubusercontent.com/DevDengChao/knife-4-summer-rs/master/docs/marketing/petstore-docs.png)

The crate serves a Nuxt-generated static UI at both `/doc.html` and `/doc`, and exposes Knife4j-compatible discovery endpoints:

- `/v3/api-docs`
- `/v3/api-docs/swagger-config`
- `/swagger-resources`
- `/swagger-resources/configuration/ui`
- `/swagger-resources/configuration/security`
- `/services.json`

## Installation

Add the published crate from crates.io:

```powershell
cargo add knife-4-summer-rs
```

For `summer-rs` applications, also enable the OpenAPI-capable web stack used by your app:

```powershell
cargo add summer@0.5
cargo add summer-web@0.5 --features openapi
cargo add tokio --features full,tracing
```

For direct `aide` / `axum` applications, add the router dependencies alongside this crate:

```powershell
cargo add aide@0.16.0-alpha.2 --features axum,axum-json
cargo add axum
cargo add tokio --features full
```

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

After `generate`, run `pnpm --dir frontend sync:assets` to refresh the embedded `assets/knife4j` files used by the Rust crate.
The generated `assets/knife4j` directory is ignored by git. It is generated locally before Rust tests and generated again by the publish workflow before the crate is packaged.

## Knife4j reference and E2E

The official Knife4j repository is pinned as a submodule at `references/knife4j`.
It is used only as an E2E rendering baseline; runtime code is still the Nuxt UI in this crate.

```powershell
git submodule update --init references/knife4j
git -C references/knife4j sparse-checkout init --cone
git -C references/knife4j sparse-checkout set knife4j-vue3
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend e2e
```

The E2E suite starts all three examples, builds the official `knife4j-vue3` UI in `.e2e-cache/`, and checks `/doc.html`, `/doc`, and the official Knife4j reference rendering against the same OpenAPI documents. On Windows, prefer the sparse checkout commands above because the full Knife4j repository contains Java paths that can exceed the default path-length limit.

The parity assertions cover document overview counts, tag and operation navigation, search, operation details, request parameters, response status and schemas, debug request controls, model switching, auth and global-parameter controls, offline export downloads, and official Knife4j management entries.

## Examples

```powershell
cargo run -p knife4j-summer-openapi-example
cargo run -p knife4j-aide-axum-example
cargo run -p knife4j-petstore-example
```

Open the printed `/doc.html` or `/doc` URL.
