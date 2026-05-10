# AGENTS.md

- 默认使用中文说明协作过程、验证结果和提交说明。
- Rust 命令在这台机器上先补 PATH：`$env:PATH='C:\Users\Admin\.cargo\bin;' + $env:PATH`。
- 前端在 `frontend/`，使用 Nuxt 静态生成、UnoCSS、Prettier、ESLint；不要复制 `knife4j` 参考仓库的前端源码。
- `pnpm` 11 会拦截构建脚本；本仓库用 `frontend/pnpm-workspace.yaml` 记录允许构建的 `@parcel/watcher`、`esbuild`、`unrs-resolver`。
- 运行 `pnpm --dir frontend generate` 后，需要把 `frontend/.output/public` 复制到 `assets/knife4j`，Rust 端通过 `rust-embed` 嵌入这些文件。
- 示例位于 `examples/`，覆盖 summer-rs 插件接入、直接 aide/axum 接入和 Petstore 对照。
- `references/knife4j` 是官方 Knife4j 对照仓库 submodule，固定用于 E2E；不要复制其源码到本项目，也不要在 submodule 内提交 `node_modules`、`dist` 或临时改动。
- Windows 下全量 checkout 官方 Knife4j 可能触发长路径问题；E2E 只需要 `knife4j-vue3`，可用 sparse checkout 初始化。
- E2E 会把官方 Knife4j UI 复制到仓库根目录 `.e2e-cache/knife4j-vue3` 构建，避免污染 submodule。
- 提交信息必须包含 `Co-authored-by` 尾注。
