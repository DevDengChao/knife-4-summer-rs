<script setup lang="ts">
import { computed } from 'vue'
import MethodBadge from './MethodBadge.vue'
import SchemaTable from './SchemaTable.vue'
import { useKnife4j } from '../composables/useKnife4j'
import { exportHtml, exportMarkdown, exportWordHtml } from '../utils/exporters'

const state = useKnife4j()

const selectedResponse = computed(() => state.activeOperation.value?.responses[0])
const selectedModel = computed(() => state.activeModel.value)

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadExport(kind: 'json' | 'markdown' | 'html' | 'word') {
  if (!state.api.value) return
  if (kind === 'json') {
    download('openapi.json', JSON.stringify(state.api.value.raw, null, 2), 'application/json')
  }
  if (kind === 'markdown') {
    download('openapi.md', exportMarkdown(state.api.value), 'text/markdown')
  }
  if (kind === 'html') {
    download('openapi.html', exportHtml(state.api.value), 'text/html')
  }
  if (kind === 'word') {
    download('openapi.doc', exportWordHtml(state.api.value), 'application/msword')
  }
}
</script>

<template>
  <main id="knife4j-doc-app" class="knife-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">K</div>
        <div class="brand-copy">
          <strong>Knife 4 summer-rs</strong>
          <a
            href="https://github.com/DevDengChao/knife-4-summer-rs"
            target="_blank"
            rel="noopener noreferrer"
            >By DevDengChao</a
          >
        </div>
      </div>
      <nav class="toolbar">
        <select
          class="group-select"
          :value="state.activeGroup.value?.name"
          @change="
            (event) => {
              const group = state.groups.value.find(
                (item) => item.name === (event.target as HTMLSelectElement).value
              )
              if (group) state.selectGroup(group)
            }
          "
        >
          <option v-for="group in state.groups.value" :key="group.name" :value="group.name">
            {{ group.name }}
          </option>
        </select>
        <button class="icon-button" title="刷新" @click="state.refreshGroups">
          <span class="i-lucide-refresh-cw k-icon" />
        </button>
        <button class="icon-button" title="鉴权" @click="state.activeTab.value = 'settings'">
          <span class="i-lucide-shield-check k-icon" />
        </button>
        <button class="icon-button" title="导出" @click="state.activeTab.value = 'exports'">
          <span class="i-lucide-download k-icon" />
        </button>
      </nav>
    </header>

    <aside class="sidebar">
      <div class="search-wrap">
        <span class="i-lucide-search k-icon" />
        <input v-model="state.keyword.value" placeholder="输入接口名称、路径或方法" />
      </div>
      <div class="sidebar-scroll">
        <section v-for="tag in state.filteredTags.value" :key="tag.name" class="tag-block">
          <div class="tag-title">
            <span class="i-lucide-folder k-icon" />
            <span>{{ tag.name }}</span>
            <em>{{ tag.operations.length }}</em>
          </div>
          <button
            v-for="operation in tag.operations"
            :key="operation.id"
            class="operation-link"
            :class="{ active: state.activeOperation.value?.id === operation.id }"
            @click="state.selectOperation(operation)"
          >
            <MethodBadge :method="operation.method" />
            <span class="operation-text">
              <strong>{{ operation.summary || operation.path }}</strong>
              <small>{{ operation.path }}</small>
            </span>
          </button>
        </section>
      </div>
    </aside>

    <section class="content">
      <div v-if="state.loading.value" class="state-box">
        <span class="i-lucide-loader-circle k-icon spin" />
        正在加载 OpenAPI 文档
      </div>
      <div v-else-if="state.error.value" class="state-box error">
        <span class="i-lucide-circle-alert k-icon" />
        {{ state.error.value }}
      </div>
      <template v-else-if="state.api.value && state.activeOperation.value">
        <section class="api-summary">
          <div>
            <h1>{{ state.api.value.title }}</h1>
            <p>{{ state.api.value.description || 'OpenAPI 文档' }}</p>
          </div>
          <div class="meta-grid">
            <span>版本 {{ state.api.value.version || '-' }}</span>
            <span>{{ state.api.value.documentVersion }}</span>
            <span>{{ state.api.value.operations.length }} APIs</span>
            <span>{{ state.api.value.models.length }} Models</span>
          </div>
        </section>

        <section class="operation-head">
          <MethodBadge :method="state.activeOperation.value.method" />
          <code>{{ state.activeOperation.value.path }}</code>
          <span v-if="state.activeOperation.value.deprecated" class="deprecated">Deprecated</span>
        </section>

        <div class="tabs">
          <button
            v-for="tab in [
              ['detail', '文档'],
              ['debug', '调试'],
              ['models', '模型'],
              ['settings', '全局参数'],
              ['exports', '离线文档']
            ]"
            :key="tab[0]"
            class="k-tab"
            :class="{ 'k-tab-active': state.activeTab.value === tab[0] }"
            @click="state.activeTab.value = tab[0] as typeof state.activeTab.value"
          >
            {{ tab[1] }}
          </button>
        </div>

        <section v-if="state.activeTab.value === 'detail'" class="panel">
          <h2>{{ state.activeOperation.value.summary || state.activeOperation.value.path }}</h2>
          <p>{{ state.activeOperation.value.description || '暂无接口说明' }}</p>

          <h3>请求参数</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>位置</th>
                <th>类型</th>
                <th>必填</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="parameter in state.activeOperation.value.parameters"
                :key="`${parameter.in}-${parameter.name}`"
              >
                <td>
                  <code>{{ parameter.name }}</code>
                </td>
                <td>{{ parameter.in }}</td>
                <td>
                  {{ parameter.type || parameter.schema?.type || parameter.schema?.$ref || '-' }}
                </td>
                <td>{{ parameter.required ? '是' : '否' }}</td>
                <td>{{ parameter.description || '-' }}</td>
              </tr>
              <tr v-if="state.activeOperation.value.parameters.length === 0">
                <td colspan="5">无参数</td>
              </tr>
            </tbody>
          </table>

          <h3>响应状态</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>状态码</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="response in state.activeOperation.value.responses" :key="response.code">
                <td>
                  <code>{{ response.code }}</code>
                </td>
                <td>{{ response.description || '-' }}</td>
              </tr>
            </tbody>
          </table>

          <h3>响应模型</h3>
          <SchemaTable :schema="selectedResponse?.schema" />
        </section>

        <section v-else-if="state.activeTab.value === 'debug'" class="panel debug-panel">
          <div class="debug-url">
            <input
              v-model="state.hostOverride.value"
              class="k-input"
              :placeholder="state.api.value.baseUrl"
            />
            <button
              class="k-button-primary"
              :disabled="state.sending.value"
              @click="state.sendDebugRequest"
            >
              <span class="i-lucide-send k-icon" />
              发送
            </button>
          </div>
          <div class="debug-params">
            <h3>请求参数</h3>
            <div
              v-for="parameter in state.activeOperation.value.parameters.filter((item) =>
                ['path', 'query', 'header'].includes(item.in || '')
              )"
              :key="`${parameter.in}-${parameter.name}`"
              class="debug-param-row"
            >
              <span>{{ parameter.in }}</span>
              <code>{{ parameter.name }}</code>
              <input
                v-model="state.parameterValues.value[`${parameter.in}:${parameter.name}`]"
                class="k-input"
                :placeholder="
                  parameter.description || parameter.type || parameter.schema?.type || ''
                "
              />
            </div>
          </div>
          <textarea v-model="state.requestBody.value" class="request-editor" spellcheck="false" />
          <div v-if="state.response.value" class="response-box">
            <div class="response-head">
              <strong
                >{{ state.response.value.status }} {{ state.response.value.statusText }}</strong
              >
              <span>{{ state.response.value.duration }}ms</span>
            </div>
            <pre>{{ state.response.value.body }}</pre>
          </div>
          <aside class="history-list">
            <h3>请求历史</h3>
            <div v-for="item in state.history.value" :key="item.id">
              <span>{{ item.method }}</span>
              <code>{{ item.status }}</code>
              <small>{{ item.url }}</small>
            </div>
          </aside>
        </section>

        <section v-else-if="state.activeTab.value === 'models'" class="panel">
          <div class="model-list">
            <button
              v-for="model in state.api.value.models"
              :key="model.name"
              class="model-pill"
              :class="{ active: selectedModel?.name === model.name }"
              @click="state.selectModel(model)"
            >
              {{ model.name }}
            </button>
          </div>
          <h2>{{ selectedModel?.name }}</h2>
          <SchemaTable :schema="selectedModel?.schema" />
        </section>

        <section v-else-if="state.activeTab.value === 'settings'" class="panel settings-grid">
          <div>
            <h2>鉴权</h2>
            <div v-for="(entry, index) in state.authEntries.value" :key="index" class="setting-row">
              <input v-model="entry.enabled" type="checkbox" />
              <input v-model="entry.name" class="k-input" placeholder="Header" />
              <input v-model="entry.value" class="k-input" placeholder="Value" />
            </div>
            <button class="k-button" @click="state.addAuthEntry">
              <span class="i-lucide-plus k-icon" />
              添加鉴权
            </button>
          </div>
          <div>
            <h2>全局参数</h2>
            <div
              v-for="(item, index) in state.globalParameters.value"
              :key="index"
              class="setting-row"
            >
              <input v-model="item.enabled" type="checkbox" />
              <select v-model="item.in" class="k-input">
                <option value="header">Header</option>
                <option value="query">Query</option>
              </select>
              <input v-model="item.name" class="k-input" placeholder="Name" />
              <input v-model="item.value" class="k-input" placeholder="Value" />
            </div>
            <button class="k-button" @click="state.addGlobalParameter">
              <span class="i-lucide-plus k-icon" />
              添加参数
            </button>
          </div>
        </section>

        <section v-else class="panel export-grid">
          <button class="export-action" @click="downloadExport('json')">
            <span class="i-lucide-file-json k-icon" />
            OpenAPI JSON
          </button>
          <button class="export-action" @click="downloadExport('markdown')">
            <span class="i-lucide-file-text k-icon" />
            Markdown
          </button>
          <button class="export-action" @click="downloadExport('html')">
            <span class="i-lucide-file-code k-icon" />
            HTML
          </button>
          <button class="export-action" @click="downloadExport('word')">
            <span class="i-lucide-file-type k-icon" />
            Word
          </button>
        </section>
      </template>
    </section>
  </main>
</template>

<style>
html,
body,
#__nuxt {
  height: 100%;
  margin: 0;
}

body {
  background: #f2f4f7;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
  letter-spacing: 0;
}

button,
input,
select,
textarea {
  border-radius: 2px;
  font: inherit;
}

button {
  cursor: pointer;
}

.knife-shell {
  display: grid;
  height: 100%;
  grid-template-areas:
    'topbar topbar'
    'sidebar content';
  grid-template-columns: 332px minmax(0, 1fr);
  grid-template-rows: 50px minmax(0, 1fr);
}

.topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #d9dee7;
  background: #1f2937;
  color: #fff;
  padding: 0 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  background: #d34516;
  font-weight: 800;
}

.brand strong {
  display: block;
  font-size: 15px;
}

.brand a {
  display: block;
  color: #cbd5e1;
  font-size: 11px;
  text-decoration: none;
}

.brand a:hover {
  color: #fff;
  text-decoration: underline;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-select {
  height: 30px;
  border: 1px solid #4b5563;
  background: #111827;
  color: #fff;
  padding: 0 8px;
}

.icon-button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #4b5563;
  background: #111827;
  color: #fff;
}

.sidebar {
  grid-area: sidebar;
  min-height: 0;
  border-right: 1px solid #d9dee7;
  background: #fff;
}

.search-wrap {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 43px;
  border-bottom: 1px solid #edf0f5;
  padding: 0 12px;
}

.search-wrap input {
  width: 100%;
  border: 0;
  outline: none;
}

.sidebar-scroll {
  height: calc(100% - 44px);
  overflow: auto;
  padding: 8px 0;
}

.tag-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  color: #344054;
  font-weight: 600;
}

.tag-title em {
  margin-left: auto;
  color: #98a2b3;
  font-style: normal;
}

.operation-link {
  display: grid;
  width: 100%;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border: 0;
  border-left: 3px solid transparent;
  background: #fff;
  padding: 7px 10px 7px 16px;
  text-align: left;
}

.operation-link:hover,
.operation-link.active {
  border-left-color: #1677ff;
  background: #f0f7ff;
}

.operation-text {
  min-width: 0;
}

.operation-text strong,
.operation-text small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operation-text small {
  color: #667085;
}

.content {
  grid-area: content;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.state-box {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #d9dee7;
  background: #fff;
  padding: 16px;
}

.state-box.error {
  border-color: #fda29b;
  color: #b42318;
}

.spin {
  animation: spin 1s linear infinite;
}

.api-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border: 1px solid #d9dee7;
  background: #fff;
  padding: 14px;
}

.api-summary h1 {
  margin: 0 0 6px;
  font-size: 20px;
}

.api-summary p {
  margin: 0;
  color: #667085;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(90px, 1fr));
  gap: 6px;
}

.meta-grid span {
  border: 1px solid #edf0f5;
  background: #fafafa;
  padding: 5px 8px;
  text-align: center;
}

.operation-head {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #d9dee7;
  border-top: 0;
  background: #fbfcfe;
  padding: 10px 14px;
}

.operation-head code {
  font-size: 15px;
  font-weight: 600;
}

.deprecated {
  background: #fff1f3;
  color: #c01048;
  padding: 2px 6px;
}

.tabs {
  display: flex;
  border: 1px solid #d9dee7;
  border-top: 0;
  background: #fff;
  padding: 0 10px;
}

.panel {
  border: 1px solid #d9dee7;
  border-top: 0;
  background: #fff;
  padding: 16px;
}

.panel h2 {
  margin: 0 0 8px;
  font-size: 17px;
}

.panel h3 {
  margin: 18px 0 8px;
  font-size: 14px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.data-table th {
  background: #fafafa;
}

.debug-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 12px;
}

.debug-url {
  display: flex;
  grid-column: 1 / 2;
  gap: 8px;
}

.debug-url input {
  flex: 1;
}

.debug-params {
  display: grid;
  gap: 8px;
}

.debug-params h3 {
  margin: 0;
}

.debug-param-row {
  display: grid;
  grid-template-columns: 64px minmax(80px, 160px) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.debug-param-row span {
  color: #667085;
  text-transform: uppercase;
}

.request-editor {
  min-height: 180px;
  resize: vertical;
  border: 1px solid #d9d9d9;
  padding: 10px;
  font-family: 'Cascadia Code', Consolas, monospace;
}

.response-box {
  overflow: hidden;
  border: 1px solid #d9dee7;
}

.response-head {
  display: flex;
  justify-content: space-between;
  background: #f9fafb;
  padding: 8px 10px;
}

.response-box pre {
  max-height: 260px;
  margin: 0;
  overflow: auto;
  padding: 10px;
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: pre-wrap;
}

.history-list {
  grid-row: 1 / span 3;
  grid-column: 2;
  border-left: 1px solid #edf0f5;
  padding-left: 12px;
}

.history-list div {
  display: grid;
  grid-template-columns: 48px 44px minmax(0, 1fr);
  gap: 6px;
  border-bottom: 1px solid #edf0f5;
  padding: 7px 0;
}

.history-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-list,
.export-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.model-pill,
.export-action {
  border: 1px solid #d9dee7;
  background: #fbfcfe;
  padding: 8px 10px;
}

.model-pill.active {
  border-color: #1677ff;
  background: #f0f7ff;
  color: #0958d9;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.setting-row {
  display: grid;
  grid-template-columns: 22px minmax(90px, 130px) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.settings-grid > div:nth-child(2) .setting-row {
  grid-template-columns: 22px 90px minmax(90px, 1fr) minmax(0, 1fr);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 860px) {
  .knife-shell {
    grid-template-areas:
      'topbar'
      'content';
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .api-summary,
  .debug-panel,
  .settings-grid {
    display: block;
  }

  .history-list {
    border-left: 0;
    padding-left: 0;
  }
}
</style>
