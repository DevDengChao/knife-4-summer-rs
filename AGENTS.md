# AGENTS.md

- 默认使用中文说明协作过程、验证结果和提交说明。
- Rust 命令在这台机器上先补 PATH：`$env:PATH='C:\Users\Admin\.cargo\bin;' + $env:PATH`。
- 前端在 `frontend/`，使用 Nuxt 静态生成、UnoCSS、Prettier、ESLint；不要复制 `knife4j` 参考仓库的前端源码。
- `pnpm` 11 会拦截构建脚本；本仓库用 `frontend/pnpm-workspace.yaml` 记录允许构建的 `@parcel/watcher`、`esbuild`、`unrs-resolver`。
- 运行 `pnpm --dir frontend generate` 后，需要用 `pnpm --dir frontend sync:assets` 把 `frontend/.output/public` 复制到本地忽略目录 `assets/knife4j`，Rust 端通过 `rust-embed` 嵌入这些生成文件。
- 示例位于 `examples/`，覆盖 summer-rs 插件接入、直接 aide/axum 接入和 Petstore 对照。
- `references/knife4j` 是官方 Knife4j 对照仓库 submodule，固定用于 E2E；不要复制其源码到本项目，也不要在 submodule 内提交 `node_modules`、`dist` 或临时改动。
- Windows 下全量 checkout 官方 Knife4j 可能触发长路径问题；E2E 只需要 `knife4j-vue3`，可用 sparse checkout 初始化。
- E2E 会把官方 Knife4j UI 复制到仓库根目录 `.e2e-cache/knife4j-vue3` 构建，避免污染 submodule。
- crates.io 发布由 `.github/workflows/publish-crate.yml` 在推送裸 SemVer tag（例如 `0.1.1`）时触发；tag 必须与 `Cargo.toml` 的 `workspace.package.version` 完全一致，不使用 `v` 前缀。
- 发布认证使用 crates.io Trusted Publishing，GitHub Environment 名为 `release`，不要引入长期 `CARGO_REGISTRY_TOKEN`。
- `assets/knife4j` 是发布现场生成目录，不再提交到 git；workflow 会重新生成并用 `cargo package --allow-dirty --list` 校验生成资源进入 crate 包。
- 提交信息必须包含 `Co-authored-by` 尾注。
