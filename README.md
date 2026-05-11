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

## Release

Crates are published by GitHub Actions when a bare stable SemVer tag is pushed. Use a tag such as `0.1.1`; do not use a `v` prefix, prerelease suffix, or date-style version.

Before pushing the tag:

```powershell
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend test
pnpm --dir frontend lint
pnpm --dir frontend format
pnpm --dir frontend generate
pnpm --dir frontend sync:assets
$env:PATH='C:\Users\Admin\.cargo\bin;' + $env:PATH
cargo test --workspace
cargo publish --dry-run --locked -p knife-4-summer-rs
```

Commit the `Cargo.toml` version bump and any regenerated `assets/knife4j` files, then create and push a tag that exactly matches the Cargo package version:

```powershell
git tag 0.1.1
git push origin master
git push origin 0.1.1
```

The workflow uses crates.io Trusted Publishing. Configure the crate's Trusted Publisher with provider `GitHub Actions`, repository `DevDengChao/knife-4-summer-rs`, workflow file `publish-crate.yml`, and environment `release`.

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
