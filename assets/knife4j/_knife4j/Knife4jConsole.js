import { d as defineComponent, z as openBlock, A as createElementBlock, C as toDisplayString, l as unref, L as normalizeClass, _ as _export_sfc, B as createBaseVNode, M as Fragment, N as renderList, i as ref, o as onMounted, O as watch, m as computed, P as withDirectives, Q as vModelText, D as createVNode, F as createTextVNode, R as createCommentVNode, S as vModelCheckbox, T as vModelSelect } from "./entry.js";
const METHODS = ["get", "post", "put", "delete", "patch", "head", "options", "trace"];
const METHOD_LABELS = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
  head: "HEAD",
  options: "OPTIONS",
  trace: "TRACE"
};
function parseOpenApi(document2) {
  const operations = collectOperations(document2);
  const tagDescriptions = new Map(
    (document2.tags ?? []).filter((tag) => tag.name).map((tag) => [tag.name, tag.description ?? ""])
  );
  const tags = groupOperations(operations, tagDescriptions);
  const schemaMap = document2.components?.schemas ?? document2.definitions ?? {};
  return {
    title: document2.info?.title ?? "OpenAPI",
    version: document2.info?.version ?? "",
    description: document2.info?.description ?? "",
    documentVersion: document2.swagger?.startsWith("2") ? "2.0" : "3.x",
    baseUrl: resolveBaseUrl(document2),
    tags,
    operations,
    models: Object.entries(schemaMap).map(([name, schema]) => ({ name, schema })),
    securitySchemes: Object.entries(
      document2.components?.securitySchemes ?? document2.securityDefinitions ?? {}
    ).map(([name, scheme]) => ({ name, scheme })),
    raw: document2
  };
}
function methodLabel(method) {
  return METHOD_LABELS[method];
}
function schemaType(schema) {
  if (!schema) return "object";
  if (schema.$ref) return refName(schema.$ref);
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type === "array") return `array<${schemaType(schema.items)}>`;
  if (schema.type) return schema.format ? `${schema.type}(${schema.format})` : schema.type;
  if (schema.oneOf?.length) return schema.oneOf.map(schemaType).join(" | ");
  if (schema.anyOf?.length) return schema.anyOf.map(schemaType).join(" | ");
  if (schema.allOf?.length) return schema.allOf.map(schemaType).join(" & ");
  return "object";
}
function exampleFromSchema(schema) {
  if (!schema) return {};
  if (schema.example !== void 0) return schema.example;
  if (schema.default !== void 0) return schema.default;
  if (schema.$ref) return { [`${refName(schema.$ref)}`]: {} };
  const type = Array.isArray(schema.type) ? schema.type.find((item) => item !== "null") : schema.type;
  if (type === "array") return [exampleFromSchema(schema.items)];
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return true;
  if (type === "string") return schema.enum?.[0] ?? "";
  if (schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, exampleFromSchema(value)])
    );
  }
  return {};
}
function resolveRelativeUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = window.location.pathname.replace(/\/(?:doc\.html|doc)?$/, "/");
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(url.replace(/^\//, ""), `${window.location.origin}${cleanBase}`).toString();
}
async function loadDiscoveryGroups(fetcher = fetch) {
  const candidates = ["/v3/api-docs/swagger-config", "/swagger-resources", "/services.json"];
  for (const candidate of candidates) {
    try {
      const response = await fetcher(resolveRelativeUrl(candidate));
      if (!response.ok) continue;
      const payload = await response.json();
      const groups = normalizeDiscoveryPayload(payload);
      if (groups.length > 0) return groups;
    } catch {
    }
  }
  return [{ name: "default", url: "v3/api-docs", swaggerVersion: "3.0.3" }];
}
function normalizeDiscoveryPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object").map((item) => ({
      name: String(item.name ?? item.serviceId ?? "default"),
      url: String(item.url ?? item.location ?? ""),
      location: item.location ? String(item.location) : void 0,
      swaggerVersion: item.swaggerVersion ? String(item.swaggerVersion) : void 0
    })).filter((item) => item.url);
  }
  if (payload && typeof payload === "object" && Array.isArray(payload.urls)) {
    return payload.urls.map((item) => ({
      name: String(item.name ?? "default"),
      url: String(item.url ?? ""),
      swaggerVersion: "3.0.3"
    })).filter((item) => item.url);
  }
  return [];
}
function collectOperations(document2) {
  const operations = [];
  for (const [path, pathItem] of Object.entries(document2.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const commonParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") continue;
      const tag = operation.tags?.[0] ?? "default";
      const requestBodyContentTypes = Object.keys(operation.requestBody?.content ?? {});
      const consumes = operation.consumes ?? requestBodyContentTypes;
      const produces = operation.produces ?? Object.keys(firstJsonObject(operation.responses)?.content ?? {});
      operations.push({
        id: operation.operationId ?? `${method}-${path}`,
        method,
        path,
        tag,
        summary: operation.summary ?? "",
        description: operation.description ?? "",
        deprecated: Boolean(operation.deprecated),
        consumes,
        produces,
        parameters: [...commonParameters, ...operation.parameters ?? []],
        rawRequestBodyContent: operation.requestBody?.content ?? {},
        requestBodyContentTypes,
        responses: Object.entries(operation.responses ?? {}).map(([code, response]) => ({
          code,
          description: response.description ?? "",
          schema: response.schema ?? firstSchema(response.content)
        })),
        security: operation.security ?? document2.security ?? []
      });
    }
  }
  return operations;
}
function groupOperations(operations, tagDescriptions) {
  const groups = /* @__PURE__ */ new Map();
  for (const operation of operations) {
    if (!groups.has(operation.tag)) {
      groups.set(operation.tag, {
        name: operation.tag,
        description: tagDescriptions.get(operation.tag) ?? "",
        operations: []
      });
    }
    groups.get(operation.tag)?.operations.push(operation);
  }
  return [...groups.values()];
}
function resolveBaseUrl(document2) {
  if (document2.servers?.[0]?.url) return document2.servers[0].url;
  const scheme = document2.schemes?.[0] ?? window.location.protocol.replace(":", "");
  const host = document2.host ?? window.location.host;
  const basePath = document2.basePath ?? "";
  return `${scheme}://${host}${basePath}`;
}
function firstJsonObject(record) {
  if (!record) return void 0;
  return Object.values(record)[0];
}
function firstSchema(content) {
  if (!content) return void 0;
  return Object.values(content).find((item) => item.schema)?.schema;
}
function refName(ref2) {
  return ref2.split("/").pop() ?? ref2;
}
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "MethodBadge",
  props: {
    method: {}
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("span", {
        class: normalizeClass(["method-badge", `method-${__props.method}`])
      }, toDisplayString(unref(methodLabel)(__props.method)), 3);
    };
  }
});
const MethodBadge = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$2, [["__scopeId", "data-v-c10db21f"]]), { __name: "MethodBadge" });
const _hoisted_1$1 = {
  key: 0,
  class: "schema-table-wrap"
};
const _hoisted_2$1 = { class: "schema-table" };
const _hoisted_3$1 = {
  key: 1,
  class: "schema-empty"
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "SchemaTable",
  props: {
    schema: {}
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return __props.schema?.properties ? (openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("table", _hoisted_2$1, [
          _cache[0] || (_cache[0] = createBaseVNode("thead", null, [
            createBaseVNode("tr", null, [
              createBaseVNode("th", null, "名称"),
              createBaseVNode("th", null, "类型"),
              createBaseVNode("th", null, "必填"),
              createBaseVNode("th", null, "说明")
            ])
          ], -1)),
          createBaseVNode("tbody", null, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(__props.schema.properties, (item, name) => {
              return openBlock(), createElementBlock("tr", {
                key: String(name)
              }, [
                createBaseVNode("td", null, [
                  createBaseVNode("code", null, toDisplayString(name), 1)
                ]),
                createBaseVNode("td", null, toDisplayString(unref(schemaType)(item)), 1),
                createBaseVNode("td", null, toDisplayString(__props.schema.required?.includes(String(name)) ? "是" : "否"), 1),
                createBaseVNode("td", null, toDisplayString(item.description || "-"), 1)
              ]);
            }), 128))
          ])
        ])
      ])) : (openBlock(), createElementBlock("pre", _hoisted_3$1, toDisplayString(JSON.stringify(__props.schema ?? {}, null, 2)), 1));
    };
  }
});
const SchemaTable = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$1, [["__scopeId", "data-v-071ab5d7"]]), { __name: "SchemaTable" });
const HISTORY_KEY = "knife4j-rs-history";
const AUTH_KEY = "knife4j-rs-auth";
const PARAM_KEY = "knife4j-rs-global-params";
function useKnife4j() {
  const groups = ref([]);
  const activeGroup = ref();
  const api = ref();
  const activeOperation = ref();
  const activeModel = ref();
  const keyword = ref("");
  const loading = ref(true);
  const error = ref("");
  const hostOverride = ref("");
  const activeTab = ref("detail");
  const requestBody = ref("");
  const parameterValues = ref({});
  const response = ref();
  const sending = ref(false);
  const authEntries = ref(loadStored(AUTH_KEY, []));
  const globalParameters = ref(
    loadStored(PARAM_KEY, [{ name: "tenant-id", value: "", in: "header", enabled: false }])
  );
  const history = ref(loadStored(HISTORY_KEY, []));
  const filteredTags = computed(() => {
    if (!api.value) return [];
    const term = keyword.value.trim().toLowerCase();
    if (!term) return api.value.tags;
    return api.value.tags.map((tag) => ({
      ...tag,
      operations: tag.operations.filter(
        (operation) => `${operation.path} ${operation.summary} ${operation.description} ${operation.method}`.toLowerCase().includes(term)
      )
    })).filter((tag) => tag.operations.length > 0);
  });
  const baseUrl = computed(
    () => hostOverride.value.trim() || api.value?.baseUrl || window.location.origin
  );
  onMounted(async () => {
    await refreshGroups();
  });
  watch(authEntries, (value) => store(AUTH_KEY, value), { deep: true });
  watch(globalParameters, (value) => store(PARAM_KEY, value), { deep: true });
  watch(history, (value) => store(HISTORY_KEY, value.slice(0, 20)), { deep: true });
  async function refreshGroups() {
    loading.value = true;
    error.value = "";
    try {
      groups.value = await loadDiscoveryGroups();
      activeGroup.value = groups.value[0];
      await loadActiveGroup();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }
  async function loadActiveGroup() {
    if (!activeGroup.value) return;
    loading.value = true;
    error.value = "";
    try {
      const document2 = await fetchJson(resolveRelativeUrl(activeGroup.value.url));
      api.value = parseOpenApi(document2);
      activeOperation.value = api.value.operations[0];
      activeModel.value = api.value.models[0];
      resetDebugInputs(activeOperation.value);
      response.value = void 0;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }
  function selectGroup(group) {
    activeGroup.value = group;
    void loadActiveGroup();
  }
  function selectOperation(operation) {
    activeOperation.value = operation;
    activeTab.value = "detail";
    resetDebugInputs(operation);
    response.value = void 0;
  }
  function selectModel(model) {
    activeModel.value = model;
  }
  async function sendDebugRequest() {
    if (!activeOperation.value) return;
    sending.value = true;
    response.value = void 0;
    const started = performance.now();
    try {
      const url = buildRequestUrl(activeOperation.value);
      const headers = buildHeaders(activeOperation.value);
      const init = {
        method: activeOperation.value.method.toUpperCase(),
        headers
      };
      if (!["get", "head"].includes(activeOperation.value.method) && requestBody.value.trim()) {
        init.body = requestBody.value;
      }
      const result = await fetch(url, init);
      const body = await result.text();
      response.value = {
        status: result.status,
        statusText: result.statusText,
        duration: Math.round(performance.now() - started),
        headers: [...result.headers.entries()],
        body
      };
      history.value.unshift({
        id: crypto.randomUUID(),
        method: activeOperation.value.method.toUpperCase(),
        url,
        status: result.status,
        time: (/* @__PURE__ */ new Date()).toLocaleString()
      });
      history.value = history.value.slice(0, 20);
    } catch (err) {
      response.value = {
        status: 0,
        statusText: "Request failed",
        duration: Math.round(performance.now() - started),
        headers: [],
        body: err instanceof Error ? err.message : String(err)
      };
    } finally {
      sending.value = false;
    }
  }
  function addAuthEntry() {
    authEntries.value.push({ name: "Authorization", value: "Bearer ", enabled: true });
  }
  function addGlobalParameter() {
    globalParameters.value.push({ name: "", value: "", in: "header", enabled: true });
  }
  function buildRequestUrl(operation) {
    const url = new URL(
      operation.path.replaceAll(
        /\{([^}]+)\}/g,
        (_match, name) => encodeURIComponent(parameterValues.value[pathParameterKey(name)] || `:${name}`)
      ),
      normalizeBase(baseUrl.value)
    );
    for (const parameter of operation.parameters.filter((item) => item.in === "query")) {
      const value = parameterValues.value[parameterKey(parameter)];
      if (parameter.name && value) url.searchParams.set(parameter.name, value);
    }
    const parameters = [
      ...globalParameters.value.filter((item) => item.enabled && item.in === "query")
    ];
    for (const parameter of parameters) {
      if (parameter.name) url.searchParams.set(parameter.name, parameter.value);
    }
    return url.toString();
  }
  function buildHeaders(operation) {
    const headers = new Headers();
    const contentType = operation.consumes[0] ?? operation.requestBodyContentTypes[0];
    if (contentType) headers.set("content-type", contentType);
    for (const item of authEntries.value) {
      if (item.enabled && item.name) headers.set(item.name, item.value);
    }
    for (const parameter of operation.parameters.filter((item) => item.in === "header")) {
      const value = parameterValues.value[parameterKey(parameter)];
      if (parameter.name && value) headers.set(parameter.name, value);
    }
    for (const item of globalParameters.value) {
      if (item.enabled && item.in === "header" && item.name) headers.set(item.name, item.value);
    }
    return headers;
  }
  function resetDebugInputs(operation) {
    requestBody.value = defaultRequestBody(operation);
    parameterValues.value = Object.fromEntries(
      (operation?.parameters ?? []).map((parameter) => [
        parameterKey(parameter),
        parameter.example !== void 0 || parameter.default !== void 0 ? String(parameter.example ?? parameter.default) : ""
      ])
    );
  }
  return {
    groups,
    activeGroup,
    api,
    activeModel,
    activeOperation,
    activeTab,
    authEntries,
    baseUrl,
    error,
    filteredTags,
    globalParameters,
    history,
    hostOverride,
    keyword,
    loading,
    parameterValues,
    requestBody,
    response,
    sending,
    addAuthEntry,
    addGlobalParameter,
    refreshGroups,
    selectGroup,
    selectModel,
    selectOperation,
    sendDebugRequest
  };
}
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return await response.json();
}
function defaultRequestBody(operation) {
  if (!operation) return "";
  const bodyParameter = operation.parameters.find((parameter) => parameter.in === "body");
  if (bodyParameter?.schema) return JSON.stringify(exampleFromSchema(bodyParameter.schema), null, 2);
  const requestSchema = Object.values(operation.rawRequestBodyContent)[0]?.schema;
  if (requestSchema) return JSON.stringify(exampleFromSchema(requestSchema), null, 2);
  if (operation.requestBodyContentTypes.length > 0) return "{}";
  return "";
}
function parameterKey(parameter) {
  return `${parameter.in ?? "query"}:${parameter.name ?? ""}`;
}
function pathParameterKey(name) {
  return `path:${name}`;
}
function normalizeBase(base) {
  return base.endsWith("/") ? base : `${base}/`;
}
function loadStored(key, fallback) {
  if (typeof localStorage === "undefined") return fallback;
  const value = localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function store(key, value) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}
function exportMarkdown(api) {
  const lines = [`# ${api.title}`, "", api.description, "", `Version: ${api.version}`, ""].filter(
    Boolean
  );
  for (const operation of api.operations) {
    lines.push(
      `## ${methodLabel(operation.method)} ${operation.path}`,
      "",
      operation.summary || operation.description || "",
      "",
      "| Code | Description |",
      "| --- | --- |"
    );
    for (const response of operation.responses) {
      lines.push(`| ${response.code} | ${response.description || "-"} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function exportHtml(api) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(api.title)}</title></head><body>${api.operations.map(operationHtml).join("")}</body></html>`;
}
function exportWordHtml(api) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}.knife4j-word-title{font-weight:bold;margin-top:16px}.knife4j-word-method{color:#fff;background:#1677ff;padding:2px 6px}</style></head><body><h1>${escapeHtml(api.title)}</h1>${api.operations.map(operationHtml).join("")}</body></html>`;
}
function operationHtml(operation) {
  return `<section><h2><span class="knife4j-word-method">${methodLabel(operation.method)}</span> ${escapeHtml(
    operation.path
  )}</h2><p>${escapeHtml(operation.summary || operation.description || "")}</p></section>`;
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const _hoisted_1 = {
  id: "knife4j-doc-app",
  class: "knife-shell"
};
const _hoisted_2 = { class: "topbar" };
const _hoisted_3 = { class: "toolbar" };
const _hoisted_4 = ["value"];
const _hoisted_5 = ["value"];
const _hoisted_6 = { class: "sidebar" };
const _hoisted_7 = { class: "search-wrap" };
const _hoisted_8 = { class: "sidebar-scroll" };
const _hoisted_9 = { class: "tag-title" };
const _hoisted_10 = ["onClick"];
const _hoisted_11 = { class: "operation-text" };
const _hoisted_12 = { class: "content" };
const _hoisted_13 = {
  key: 0,
  class: "state-box"
};
const _hoisted_14 = {
  key: 1,
  class: "state-box error"
};
const _hoisted_15 = { class: "api-summary" };
const _hoisted_16 = { class: "meta-grid" };
const _hoisted_17 = { class: "operation-head" };
const _hoisted_18 = {
  key: 0,
  class: "deprecated"
};
const _hoisted_19 = { class: "tabs" };
const _hoisted_20 = ["onClick"];
const _hoisted_21 = {
  key: 0,
  class: "panel"
};
const _hoisted_22 = { class: "data-table" };
const _hoisted_23 = { key: 0 };
const _hoisted_24 = { class: "data-table" };
const _hoisted_25 = {
  key: 1,
  class: "panel debug-panel"
};
const _hoisted_26 = { class: "debug-url" };
const _hoisted_27 = ["placeholder"];
const _hoisted_28 = ["disabled"];
const _hoisted_29 = { class: "debug-params" };
const _hoisted_30 = ["onUpdate:modelValue", "placeholder"];
const _hoisted_31 = {
  key: 0,
  class: "response-box"
};
const _hoisted_32 = { class: "response-head" };
const _hoisted_33 = { class: "history-list" };
const _hoisted_34 = {
  key: 2,
  class: "panel"
};
const _hoisted_35 = { class: "model-list" };
const _hoisted_36 = ["onClick"];
const _hoisted_37 = {
  key: 3,
  class: "panel settings-grid"
};
const _hoisted_38 = ["onUpdate:modelValue"];
const _hoisted_39 = ["onUpdate:modelValue"];
const _hoisted_40 = ["onUpdate:modelValue"];
const _hoisted_41 = ["onUpdate:modelValue"];
const _hoisted_42 = ["onUpdate:modelValue"];
const _hoisted_43 = ["onUpdate:modelValue"];
const _hoisted_44 = ["onUpdate:modelValue"];
const _hoisted_45 = {
  key: 4,
  class: "panel export-grid"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "Knife4jConsole",
  setup(__props) {
    const state = useKnife4j();
    const selectedResponse = computed(() => state.activeOperation.value?.responses[0]);
    const selectedModel = computed(() => state.activeModel.value);
    function download(filename, content, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    function downloadExport(kind) {
      if (!state.api.value) return;
      if (kind === "json") {
        download("openapi.json", JSON.stringify(state.api.value.raw, null, 2), "application/json");
      }
      if (kind === "markdown") {
        download("openapi.md", exportMarkdown(state.api.value), "text/markdown");
      }
      if (kind === "html") {
        download("openapi.html", exportHtml(state.api.value), "text/html");
      }
      if (kind === "word") {
        download("openapi.doc", exportWordHtml(state.api.value), "application/msword");
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("main", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          _cache[17] || (_cache[17] = createBaseVNode("div", { class: "brand" }, [
            createBaseVNode("div", { class: "brand-mark" }, "K"),
            createBaseVNode("div", { class: "brand-copy" }, [
              createBaseVNode("strong", null, "Knife 4 summer-rs"),
              createBaseVNode("a", {
                href: "https://github.com/DevDengChao/knife-4-summer-rs",
                target: "_blank",
                rel: "noopener noreferrer"
              }, "By DevDengChao")
            ])
          ], -1)),
          createBaseVNode("nav", _hoisted_3, [
            createBaseVNode("select", {
              class: "group-select",
              value: unref(state).activeGroup.value?.name,
              onChange: _cache[0] || (_cache[0] = (event) => {
                const group = unref(state).groups.value.find(
                  (item) => item.name === event.target.value
                );
                if (group) unref(state).selectGroup(group);
              })
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).groups.value, (group) => {
                return openBlock(), createElementBlock("option", {
                  key: group.name,
                  value: group.name
                }, toDisplayString(group.name), 9, _hoisted_5);
              }), 128))
            ], 40, _hoisted_4),
            createBaseVNode("button", {
              class: "icon-button",
              title: "刷新",
              onClick: _cache[1] || (_cache[1] = //@ts-ignore
              (...args) => unref(state).refreshGroups && unref(state).refreshGroups(...args))
            }, [..._cache[14] || (_cache[14] = [
              createBaseVNode("span", { class: "i-lucide-refresh-cw k-icon" }, null, -1)
            ])]),
            createBaseVNode("button", {
              class: "icon-button",
              title: "鉴权",
              onClick: _cache[2] || (_cache[2] = ($event) => unref(state).activeTab.value = "settings")
            }, [..._cache[15] || (_cache[15] = [
              createBaseVNode("span", { class: "i-lucide-shield-check k-icon" }, null, -1)
            ])]),
            createBaseVNode("button", {
              class: "icon-button",
              title: "导出",
              onClick: _cache[3] || (_cache[3] = ($event) => unref(state).activeTab.value = "exports")
            }, [..._cache[16] || (_cache[16] = [
              createBaseVNode("span", { class: "i-lucide-download k-icon" }, null, -1)
            ])])
          ])
        ]),
        createBaseVNode("aside", _hoisted_6, [
          createBaseVNode("div", _hoisted_7, [
            _cache[18] || (_cache[18] = createBaseVNode("span", { class: "i-lucide-search k-icon" }, null, -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => unref(state).keyword.value = $event),
              placeholder: "输入接口名称、路径或方法"
            }, null, 512), [
              [vModelText, unref(state).keyword.value]
            ])
          ]),
          createBaseVNode("div", _hoisted_8, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).filteredTags.value, (tag) => {
              return openBlock(), createElementBlock("section", {
                key: tag.name,
                class: "tag-block"
              }, [
                createBaseVNode("div", _hoisted_9, [
                  _cache[19] || (_cache[19] = createBaseVNode("span", { class: "i-lucide-folder k-icon" }, null, -1)),
                  createBaseVNode("span", null, toDisplayString(tag.name), 1),
                  createBaseVNode("em", null, toDisplayString(tag.operations.length), 1)
                ]),
                (openBlock(true), createElementBlock(Fragment, null, renderList(tag.operations, (operation) => {
                  return openBlock(), createElementBlock("button", {
                    key: operation.id,
                    class: normalizeClass(["operation-link", { active: unref(state).activeOperation.value?.id === operation.id }]),
                    onClick: ($event) => unref(state).selectOperation(operation)
                  }, [
                    createVNode(MethodBadge, {
                      method: operation.method
                    }, null, 8, ["method"]),
                    createBaseVNode("span", _hoisted_11, [
                      createBaseVNode("strong", null, toDisplayString(operation.summary || operation.path), 1),
                      createBaseVNode("small", null, toDisplayString(operation.path), 1)
                    ])
                  ], 10, _hoisted_10);
                }), 128))
              ]);
            }), 128))
          ])
        ]),
        createBaseVNode("section", _hoisted_12, [
          unref(state).loading.value ? (openBlock(), createElementBlock("div", _hoisted_13, [..._cache[20] || (_cache[20] = [
            createBaseVNode("span", { class: "i-lucide-loader-circle k-icon spin" }, null, -1),
            createTextVNode(" 正在加载 OpenAPI 文档 ", -1)
          ])])) : unref(state).error.value ? (openBlock(), createElementBlock("div", _hoisted_14, [
            _cache[21] || (_cache[21] = createBaseVNode("span", { class: "i-lucide-circle-alert k-icon" }, null, -1)),
            createTextVNode(" " + toDisplayString(unref(state).error.value), 1)
          ])) : unref(state).api.value && unref(state).activeOperation.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("section", _hoisted_15, [
              createBaseVNode("div", null, [
                createBaseVNode("h1", null, toDisplayString(unref(state).api.value.title), 1),
                createBaseVNode("p", null, toDisplayString(unref(state).api.value.description || "OpenAPI 文档"), 1)
              ]),
              createBaseVNode("div", _hoisted_16, [
                createBaseVNode("span", null, "版本 " + toDisplayString(unref(state).api.value.version || "-"), 1),
                createBaseVNode("span", null, toDisplayString(unref(state).api.value.documentVersion), 1),
                createBaseVNode("span", null, toDisplayString(unref(state).api.value.operations.length) + " APIs", 1),
                createBaseVNode("span", null, toDisplayString(unref(state).api.value.models.length) + " Models", 1)
              ])
            ]),
            createBaseVNode("section", _hoisted_17, [
              createVNode(MethodBadge, {
                method: unref(state).activeOperation.value.method
              }, null, 8, ["method"]),
              createBaseVNode("code", null, toDisplayString(unref(state).activeOperation.value.path), 1),
              unref(state).activeOperation.value.deprecated ? (openBlock(), createElementBlock("span", _hoisted_18, "Deprecated")) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_19, [
              (openBlock(), createElementBlock(Fragment, null, renderList([
                ["detail", "文档"],
                ["debug", "调试"],
                ["models", "模型"],
                ["settings", "全局参数"],
                ["exports", "离线文档"]
              ], (tab) => {
                return createBaseVNode("button", {
                  key: tab[0],
                  class: normalizeClass(["k-tab", { "k-tab-active": unref(state).activeTab.value === tab[0] }]),
                  onClick: ($event) => unref(state).activeTab.value = tab[0]
                }, toDisplayString(tab[1]), 11, _hoisted_20);
              }), 64))
            ]),
            unref(state).activeTab.value === "detail" ? (openBlock(), createElementBlock("section", _hoisted_21, [
              createBaseVNode("h2", null, toDisplayString(unref(state).activeOperation.value.summary || unref(state).activeOperation.value.path), 1),
              createBaseVNode("p", null, toDisplayString(unref(state).activeOperation.value.description || "暂无接口说明"), 1),
              _cache[25] || (_cache[25] = createBaseVNode("h3", null, "请求参数", -1)),
              createBaseVNode("table", _hoisted_22, [
                _cache[23] || (_cache[23] = createBaseVNode("thead", null, [
                  createBaseVNode("tr", null, [
                    createBaseVNode("th", null, "名称"),
                    createBaseVNode("th", null, "位置"),
                    createBaseVNode("th", null, "类型"),
                    createBaseVNode("th", null, "必填"),
                    createBaseVNode("th", null, "说明")
                  ])
                ], -1)),
                createBaseVNode("tbody", null, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).activeOperation.value.parameters, (parameter) => {
                    return openBlock(), createElementBlock("tr", {
                      key: `${parameter.in}-${parameter.name}`
                    }, [
                      createBaseVNode("td", null, [
                        createBaseVNode("code", null, toDisplayString(parameter.name), 1)
                      ]),
                      createBaseVNode("td", null, toDisplayString(parameter.in), 1),
                      createBaseVNode("td", null, toDisplayString(parameter.type || parameter.schema?.type || parameter.schema?.$ref || "-"), 1),
                      createBaseVNode("td", null, toDisplayString(parameter.required ? "是" : "否"), 1),
                      createBaseVNode("td", null, toDisplayString(parameter.description || "-"), 1)
                    ]);
                  }), 128)),
                  unref(state).activeOperation.value.parameters.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_23, [..._cache[22] || (_cache[22] = [
                    createBaseVNode("td", { colspan: "5" }, "无参数", -1)
                  ])])) : createCommentVNode("", true)
                ])
              ]),
              _cache[26] || (_cache[26] = createBaseVNode("h3", null, "响应状态", -1)),
              createBaseVNode("table", _hoisted_24, [
                _cache[24] || (_cache[24] = createBaseVNode("thead", null, [
                  createBaseVNode("tr", null, [
                    createBaseVNode("th", null, "状态码"),
                    createBaseVNode("th", null, "说明")
                  ])
                ], -1)),
                createBaseVNode("tbody", null, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).activeOperation.value.responses, (response) => {
                    return openBlock(), createElementBlock("tr", {
                      key: response.code
                    }, [
                      createBaseVNode("td", null, [
                        createBaseVNode("code", null, toDisplayString(response.code), 1)
                      ]),
                      createBaseVNode("td", null, toDisplayString(response.description || "-"), 1)
                    ]);
                  }), 128))
                ])
              ]),
              _cache[27] || (_cache[27] = createBaseVNode("h3", null, "响应模型", -1)),
              createVNode(SchemaTable, {
                schema: selectedResponse.value?.schema
              }, null, 8, ["schema"])
            ])) : unref(state).activeTab.value === "debug" ? (openBlock(), createElementBlock("section", _hoisted_25, [
              createBaseVNode("div", _hoisted_26, [
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => unref(state).hostOverride.value = $event),
                  class: "k-input",
                  placeholder: unref(state).api.value.baseUrl
                }, null, 8, _hoisted_27), [
                  [vModelText, unref(state).hostOverride.value]
                ]),
                createBaseVNode("button", {
                  class: "k-button-primary",
                  disabled: unref(state).sending.value,
                  onClick: _cache[6] || (_cache[6] = //@ts-ignore
                  (...args) => unref(state).sendDebugRequest && unref(state).sendDebugRequest(...args))
                }, [..._cache[28] || (_cache[28] = [
                  createBaseVNode("span", { class: "i-lucide-send k-icon" }, null, -1),
                  createTextVNode(" 发送 ", -1)
                ])], 8, _hoisted_28)
              ]),
              createBaseVNode("div", _hoisted_29, [
                _cache[29] || (_cache[29] = createBaseVNode("h3", null, "请求参数", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).activeOperation.value.parameters.filter(
                  (item) => ["path", "query", "header"].includes(item.in || "")
                ), (parameter) => {
                  return openBlock(), createElementBlock("div", {
                    key: `${parameter.in}-${parameter.name}`,
                    class: "debug-param-row"
                  }, [
                    createBaseVNode("span", null, toDisplayString(parameter.in), 1),
                    createBaseVNode("code", null, toDisplayString(parameter.name), 1),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": ($event) => unref(state).parameterValues.value[`${parameter.in}:${parameter.name}`] = $event,
                      class: "k-input",
                      placeholder: parameter.description || parameter.type || parameter.schema?.type || ""
                    }, null, 8, _hoisted_30), [
                      [vModelText, unref(state).parameterValues.value[`${parameter.in}:${parameter.name}`]]
                    ])
                  ]);
                }), 128))
              ]),
              withDirectives(createBaseVNode("textarea", {
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => unref(state).requestBody.value = $event),
                class: "request-editor",
                spellcheck: "false"
              }, null, 512), [
                [vModelText, unref(state).requestBody.value]
              ]),
              unref(state).response.value ? (openBlock(), createElementBlock("div", _hoisted_31, [
                createBaseVNode("div", _hoisted_32, [
                  createBaseVNode("strong", null, toDisplayString(unref(state).response.value.status) + " " + toDisplayString(unref(state).response.value.statusText), 1),
                  createBaseVNode("span", null, toDisplayString(unref(state).response.value.duration) + "ms", 1)
                ]),
                createBaseVNode("pre", null, toDisplayString(unref(state).response.value.body), 1)
              ])) : createCommentVNode("", true),
              createBaseVNode("aside", _hoisted_33, [
                _cache[30] || (_cache[30] = createBaseVNode("h3", null, "请求历史", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).history.value, (item) => {
                  return openBlock(), createElementBlock("div", {
                    key: item.id
                  }, [
                    createBaseVNode("span", null, toDisplayString(item.method), 1),
                    createBaseVNode("code", null, toDisplayString(item.status), 1),
                    createBaseVNode("small", null, toDisplayString(item.url), 1)
                  ]);
                }), 128))
              ])
            ])) : unref(state).activeTab.value === "models" ? (openBlock(), createElementBlock("section", _hoisted_34, [
              createBaseVNode("div", _hoisted_35, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).api.value.models, (model) => {
                  return openBlock(), createElementBlock("button", {
                    key: model.name,
                    class: normalizeClass(["model-pill", { active: selectedModel.value?.name === model.name }]),
                    onClick: ($event) => unref(state).selectModel(model)
                  }, toDisplayString(model.name), 11, _hoisted_36);
                }), 128))
              ]),
              createBaseVNode("h2", null, toDisplayString(selectedModel.value?.name), 1),
              createVNode(SchemaTable, {
                schema: selectedModel.value?.schema
              }, null, 8, ["schema"])
            ])) : unref(state).activeTab.value === "settings" ? (openBlock(), createElementBlock("section", _hoisted_37, [
              createBaseVNode("div", null, [
                _cache[32] || (_cache[32] = createBaseVNode("h2", null, "鉴权", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).authEntries.value, (entry, index) => {
                  return openBlock(), createElementBlock("div", {
                    key: index,
                    class: "setting-row"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": ($event) => entry.enabled = $event,
                      type: "checkbox"
                    }, null, 8, _hoisted_38), [
                      [vModelCheckbox, entry.enabled]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": ($event) => entry.name = $event,
                      class: "k-input",
                      placeholder: "Header"
                    }, null, 8, _hoisted_39), [
                      [vModelText, entry.name]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": ($event) => entry.value = $event,
                      class: "k-input",
                      placeholder: "Value"
                    }, null, 8, _hoisted_40), [
                      [vModelText, entry.value]
                    ])
                  ]);
                }), 128)),
                createBaseVNode("button", {
                  class: "k-button",
                  onClick: _cache[8] || (_cache[8] = //@ts-ignore
                  (...args) => unref(state).addAuthEntry && unref(state).addAuthEntry(...args))
                }, [..._cache[31] || (_cache[31] = [
                  createBaseVNode("span", { class: "i-lucide-plus k-icon" }, null, -1),
                  createTextVNode(" 添加鉴权 ", -1)
                ])])
              ]),
              createBaseVNode("div", null, [
                _cache[35] || (_cache[35] = createBaseVNode("h2", null, "全局参数", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(state).globalParameters.value, (item, index) => {
                  return openBlock(), createElementBlock("div", {
                    key: index,
                    class: "setting-row"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": ($event) => item.enabled = $event,
                      type: "checkbox"
                    }, null, 8, _hoisted_41), [
                      [vModelCheckbox, item.enabled]
                    ]),
                    withDirectives(createBaseVNode("select", {
                      "onUpdate:modelValue": ($event) => item.in = $event,
                      class: "k-input"
                    }, [..._cache[33] || (_cache[33] = [
                      createBaseVNode("option", { value: "header" }, "Header", -1),
                      createBaseVNode("option", { value: "query" }, "Query", -1)
                    ])], 8, _hoisted_42), [
                      [vModelSelect, item.in]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": ($event) => item.name = $event,
                      class: "k-input",
                      placeholder: "Name"
                    }, null, 8, _hoisted_43), [
                      [vModelText, item.name]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": ($event) => item.value = $event,
                      class: "k-input",
                      placeholder: "Value"
                    }, null, 8, _hoisted_44), [
                      [vModelText, item.value]
                    ])
                  ]);
                }), 128)),
                createBaseVNode("button", {
                  class: "k-button",
                  onClick: _cache[9] || (_cache[9] = //@ts-ignore
                  (...args) => unref(state).addGlobalParameter && unref(state).addGlobalParameter(...args))
                }, [..._cache[34] || (_cache[34] = [
                  createBaseVNode("span", { class: "i-lucide-plus k-icon" }, null, -1),
                  createTextVNode(" 添加参数 ", -1)
                ])])
              ])
            ])) : (openBlock(), createElementBlock("section", _hoisted_45, [
              createBaseVNode("button", {
                class: "export-action",
                onClick: _cache[10] || (_cache[10] = ($event) => downloadExport("json"))
              }, [..._cache[36] || (_cache[36] = [
                createBaseVNode("span", { class: "i-lucide-file-json k-icon" }, null, -1),
                createTextVNode(" OpenAPI JSON ", -1)
              ])]),
              createBaseVNode("button", {
                class: "export-action",
                onClick: _cache[11] || (_cache[11] = ($event) => downloadExport("markdown"))
              }, [..._cache[37] || (_cache[37] = [
                createBaseVNode("span", { class: "i-lucide-file-text k-icon" }, null, -1),
                createTextVNode(" Markdown ", -1)
              ])]),
              createBaseVNode("button", {
                class: "export-action",
                onClick: _cache[12] || (_cache[12] = ($event) => downloadExport("html"))
              }, [..._cache[38] || (_cache[38] = [
                createBaseVNode("span", { class: "i-lucide-file-code k-icon" }, null, -1),
                createTextVNode(" HTML ", -1)
              ])]),
              createBaseVNode("button", {
                class: "export-action",
                onClick: _cache[13] || (_cache[13] = ($event) => downloadExport("word"))
              }, [..._cache[39] || (_cache[39] = [
                createBaseVNode("span", { class: "i-lucide-file-type k-icon" }, null, -1),
                createTextVNode(" Word ", -1)
              ])])
            ]))
          ], 64)) : createCommentVNode("", true)
        ])
      ]);
    };
  }
});
const Knife4jConsole = Object.assign(_sfc_main, { __name: "Knife4jConsole" });
export {
  Knife4jConsole as K
};
