# knife-4-summer-rs Knife4j Nuxt Plugin Plan

## Summary

Build `knife-4-summer-rs` as a Rust crate plus a Nuxt static frontend. The Rust side exposes a summer-rs plugin and direct aide/axum routes; the frontend is a from-scratch Nuxt implementation that visually and behaviorally matches Knife4j for OpenAPI browsing, debugging, auth, settings, models, and exports.

## Key Changes

- Create a Cargo workspace in `E:\my\open-source\knife-4-summer-rs\knife-4-summer-rs` with root crate `knife-4-summer-rs`, public API:
  - `Knife4jPlugin`: immediate summer-rs plugin, so it registers routes before `WebPlugin` builds.
  - `Knife4jConfig`: `doc_path=/doc`, `doc_html_path=/doc.html`, `assets_path=/_knife4j`, `api_docs_path=/v3/api-docs`, `group_name=default`, optional external groups.
  - `knife4j_router(config) -> aide::axum::ApiRouter`: for direct aide/axum users.
- Rust routes:
  - `GET /doc.html` and `GET /doc` serve the Nuxt static entry.
  - `GET /_knife4j/*asset` serves generated Nuxt assets from embedded static files.
  - `GET /v3/api-docs` returns the `aide::openapi::OpenApi` from Axum `Extension<Arc<OpenApi>>`.
  - `GET /v3/api-docs/swagger-config`, `/swagger-resources`, `/swagger-resources/configuration/ui`, `/swagger-resources/configuration/security`, and `/services.json` return Knife4j-compatible discovery/config payloads.
- Create `frontend/` as Nuxt static SPA using `unocss`, `@nuxt/eslint`, ESLint flat config, Prettier, TypeScript, and Ant Design Vue-compatible layout styling for Knife4j parity.
- Frontend implements from scratch:
  - OpenAPI 2.0, 3.0, and 3.1 parser using Petstore v2 and summer/aide OpenAPI as fixtures.
  - Knife4j-style group selector, sidebar tree, search, operation docs, debug tab, auth modal, global parameters, models, settings, host override, request history/cache, and exports to HTML/Markdown/Word/OpenAPI JSON.
  - Relative URL handling so `/doc.html`, `/doc`, and summer `global_prefix` deployments work without hardcoded origin paths.
- Add `examples/`:
  - `examples/summer-openapi-example`: mirrors `summer-rs\examples\openapi-example` and shows `Knife4jPlugin + WebPlugin`.
  - `examples/aide-axum-example`: shows direct aide/axum integration.
  - `examples/petstore-example`: loads `https://petstore.swagger.io/v2/swagger.json` for visual and parser comparison.

## Test Plan

- Rust:
  - `cargo fmt --all -- --check`
  - `cargo clippy --workspace --all-targets`
  - `cargo test --workspace`
  - Integration tests for `/doc.html`, `/doc`, asset serving, `/v3/api-docs`, `swagger-config`, `swagger-resources`, and `services.json`.
- Frontend:
  - `pnpm --dir frontend lint`
  - `pnpm --dir frontend format`
  - `pnpm --dir frontend test`
  - `pnpm --dir frontend generate`
  - Parser tests for Petstore v2 and generated summer/aide OpenAPI.
- E2E:
  - Run the summer example, open `/doc.html` and `/doc` with Playwright, verify nonblank UI, sidebar operations, models, debug request form, auth/settings dialogs, and exports.
  - Compare main viewport against Knife4j reference layout using screenshots from the local `knife4j` checkout.

## Assumptions

- User selected "from scratch": do not copy Knife4j frontend source; use it only as behavioral and visual reference. Apache-2.0 license/NOTICE still gets documented because local Knife4j assets and behavior are reference material.
- Use `pnpm` because this machine has Node `v22.22.1` and pnpm `11.0.8`.
- Rust toolchain is installed under `C:\Users\Admin\.cargo\bin`; commands in this session should prepend that path when invoking `cargo` or `rustc`.
- The target repo started with no commits, so the initial plan/baseline commit is created in the target checkout; normal worktree flow begins after that first commit.
- Reference docs used: Nuxt generate, UnoCSS Nuxt module, Nuxt ESLint module, and Petstore Swagger JSON.
