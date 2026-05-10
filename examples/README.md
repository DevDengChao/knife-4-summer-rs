# knife-4-summer-rs examples

Run from the repository root:

```powershell
cargo run -p knife4j-summer-openapi-example
cargo run -p knife4j-aide-axum-example
cargo run -p knife4j-petstore-example
```

Then open `/doc.html` or `/doc` on the printed local URL.

These examples are also the persisted E2E matrix:

- `summer-openapi-example` verifies the summer-rs plugin path.
- `aide-axum-example` verifies direct `aide` / `axum` integration.
- `petstore-example` verifies Swagger 2.0 rendering against the Petstore document.

Each example is rendered through this crate's `/doc.html` and `/doc` routes, then through the pinned official Knife4j UI, so the same OpenAPI document is checked across all three surfaces.

Run the full browser parity check from the repository root:

```powershell
pnpm --dir frontend e2e
```
