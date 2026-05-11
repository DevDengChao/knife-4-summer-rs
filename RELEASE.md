# Release

Crates are published by GitHub Actions when a bare stable SemVer tag is pushed. Use a tag such as `0.1.3`; do not use a `v` prefix, prerelease suffix, or date-style version.

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
cargo package --allow-dirty --list -p knife-4-summer-rs
cargo publish --dry-run --locked --allow-dirty -p knife-4-summer-rs
```

`assets/knife4j` is generated locally and ignored by git. Commit the source, workflow, documentation, and `Cargo.toml` / `Cargo.lock` version bump, but do not commit regenerated `assets/knife4j` files. Then create and push a tag that exactly matches the Cargo package version:

```powershell
git tag 0.1.3
git push origin master
git push origin 0.1.3
```

The workflow generates and syncs `assets/knife4j` on the Ubuntu runner, verifies key generated files are present in `cargo package --allow-dirty --list`, then publishes with `cargo publish --locked --allow-dirty`. The `--allow-dirty` flag is required because the generated assets are intentionally ignored by git but still included by `Cargo.toml`.

The workflow uses crates.io Trusted Publishing. Configure the crate's Trusted Publisher with provider `GitHub Actions`, repository `DevDengChao/knife-4-summer-rs`, workflow file `publish-crate.yml`, and environment `release`.
