# Release

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
