import { computed, onMounted, ref, watch } from 'vue'
import type {
  ApiOperation,
  Knife4jDiscoveryGroup,
  OpenApiDocument,
  OpenApiParameter,
  ParsedOpenApi
} from '../types/openapi'
import {
  exampleFromSchema,
  loadDiscoveryGroups,
  parseOpenApi,
  resolveRelativeUrl
} from '../utils/openapi'

export interface AuthEntry {
  name: string
  value: string
  enabled: boolean
}

export interface GlobalParameter {
  name: string
  value: string
  in: 'header' | 'query'
  enabled: boolean
}

export interface DebugResult {
  status: number
  statusText: string
  duration: number
  headers: Array<[string, string]>
  body: string
}

export interface RequestHistoryItem {
  id: string
  method: string
  url: string
  status: number
  time: string
}

const HISTORY_KEY = 'knife4j-rs-history'
const AUTH_KEY = 'knife4j-rs-auth'
const PARAM_KEY = 'knife4j-rs-global-params'

export function useKnife4j() {
  const groups = ref<Knife4jDiscoveryGroup[]>([])
  const activeGroup = ref<Knife4jDiscoveryGroup>()
  const api = ref<ParsedOpenApi>()
  const activeOperation = ref<ApiOperation>()
  const activeModel = ref<ParsedOpenApi['models'][number]>()
  const keyword = ref('')
  const loading = ref(true)
  const error = ref('')
  const hostOverride = ref('')
  const activeTab = ref<'detail' | 'debug' | 'models' | 'settings' | 'exports'>('detail')
  const requestBody = ref('')
  const parameterValues = ref<Record<string, string>>({})
  const response = ref<DebugResult>()
  const sending = ref(false)
  const authEntries = ref<AuthEntry[]>(loadStored(AUTH_KEY, []))
  const globalParameters = ref<GlobalParameter[]>(
    loadStored(PARAM_KEY, [{ name: 'tenant-id', value: '', in: 'header', enabled: false }])
  )
  const history = ref<RequestHistoryItem[]>(loadStored(HISTORY_KEY, []))

  const filteredTags = computed(() => {
    if (!api.value) return []
    const term = keyword.value.trim().toLowerCase()
    if (!term) return api.value.tags
    return api.value.tags
      .map((tag) => ({
        ...tag,
        operations: tag.operations.filter((operation) =>
          `${operation.path} ${operation.summary} ${operation.description} ${operation.method}`
            .toLowerCase()
            .includes(term)
        )
      }))
      .filter((tag) => tag.operations.length > 0)
  })

  const baseUrl = computed(
    () => hostOverride.value.trim() || api.value?.baseUrl || window.location.origin
  )

  onMounted(async () => {
    await refreshGroups()
  })

  watch(authEntries, (value) => store(AUTH_KEY, value), { deep: true })
  watch(globalParameters, (value) => store(PARAM_KEY, value), { deep: true })
  watch(history, (value) => store(HISTORY_KEY, value.slice(0, 20)), { deep: true })

  async function refreshGroups() {
    loading.value = true
    error.value = ''
    try {
      groups.value = await loadDiscoveryGroups()
      activeGroup.value = groups.value[0]
      await loadActiveGroup()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function loadActiveGroup() {
    if (!activeGroup.value) return
    loading.value = true
    error.value = ''
    try {
      const document = await fetchJson<OpenApiDocument>(resolveRelativeUrl(activeGroup.value.url))
      api.value = parseOpenApi(document)
      activeOperation.value = api.value.operations[0]
      activeModel.value = api.value.models[0]
      resetDebugInputs(activeOperation.value)
      response.value = undefined
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  function selectGroup(group: Knife4jDiscoveryGroup) {
    activeGroup.value = group
    void loadActiveGroup()
  }

  function selectOperation(operation: ApiOperation) {
    activeOperation.value = operation
    activeTab.value = 'detail'
    resetDebugInputs(operation)
    response.value = undefined
  }

  function selectModel(model: ParsedOpenApi['models'][number]) {
    activeModel.value = model
  }

  async function sendDebugRequest() {
    if (!activeOperation.value) return
    sending.value = true
    response.value = undefined
    const started = performance.now()
    try {
      const url = buildRequestUrl(activeOperation.value)
      const headers = buildHeaders(activeOperation.value)
      const init: RequestInit = {
        method: activeOperation.value.method.toUpperCase(),
        headers
      }
      if (!['get', 'head'].includes(activeOperation.value.method) && requestBody.value.trim()) {
        init.body = requestBody.value
      }
      const result = await fetch(url, init)
      const body = await result.text()
      response.value = {
        status: result.status,
        statusText: result.statusText,
        duration: Math.round(performance.now() - started),
        headers: [...result.headers.entries()],
        body
      }
      history.value.unshift({
        id: crypto.randomUUID(),
        method: activeOperation.value.method.toUpperCase(),
        url,
        status: result.status,
        time: new Date().toLocaleString()
      })
      history.value = history.value.slice(0, 20)
    } catch (err) {
      response.value = {
        status: 0,
        statusText: 'Request failed',
        duration: Math.round(performance.now() - started),
        headers: [],
        body: err instanceof Error ? err.message : String(err)
      }
    } finally {
      sending.value = false
    }
  }

  function addAuthEntry() {
    authEntries.value.push({ name: 'Authorization', value: 'Bearer ', enabled: true })
  }

  function addGlobalParameter() {
    globalParameters.value.push({ name: '', value: '', in: 'header', enabled: true })
  }

  function buildRequestUrl(operation: ApiOperation): string {
    const url = new URL(
      operation.path.replaceAll(/\{([^}]+)\}/g, (_match, name: string) =>
        encodeURIComponent(parameterValues.value[pathParameterKey(name)] || `:${name}`)
      ),
      normalizeBase(baseUrl.value)
    )
    for (const parameter of operation.parameters.filter((item) => item.in === 'query')) {
      const value = parameterValues.value[parameterKey(parameter)]
      if (parameter.name && value) url.searchParams.set(parameter.name, value)
    }
    const parameters = [
      ...globalParameters.value.filter((item) => item.enabled && item.in === 'query')
    ]
    for (const parameter of parameters) {
      if (parameter.name) url.searchParams.set(parameter.name, parameter.value)
    }
    return url.toString()
  }

  function buildHeaders(operation: ApiOperation): Headers {
    const headers = new Headers()
    const contentType = operation.consumes[0] ?? operation.requestBodyContentTypes[0]
    if (contentType) headers.set('content-type', contentType)
    for (const item of authEntries.value) {
      if (item.enabled && item.name) headers.set(item.name, item.value)
    }
    for (const parameter of operation.parameters.filter((item) => item.in === 'header')) {
      const value = parameterValues.value[parameterKey(parameter)]
      if (parameter.name && value) headers.set(parameter.name, value)
    }
    for (const item of globalParameters.value) {
      if (item.enabled && item.in === 'header' && item.name) headers.set(item.name, item.value)
    }
    return headers
  }

  function resetDebugInputs(operation?: ApiOperation) {
    requestBody.value = defaultRequestBody(operation)
    parameterValues.value = Object.fromEntries(
      (operation?.parameters ?? []).map((parameter) => [
        parameterKey(parameter),
        parameter.example !== undefined || parameter.default !== undefined
          ? String(parameter.example ?? parameter.default)
          : ''
      ])
    )
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
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  }
  return (await response.json()) as T
}

function defaultRequestBody(operation?: ApiOperation): string {
  if (!operation) return ''
  const bodyParameter = operation.parameters.find((parameter) => parameter.in === 'body')
  if (bodyParameter?.schema) return JSON.stringify(exampleFromSchema(bodyParameter.schema), null, 2)
  const requestSchema = Object.values(operation.rawRequestBodyContent)[0]?.schema
  if (requestSchema) return JSON.stringify(exampleFromSchema(requestSchema), null, 2)
  if (operation.requestBodyContentTypes.length > 0) return '{}'
  return ''
}

function parameterKey(parameter: OpenApiParameter): string {
  return `${parameter.in ?? 'query'}:${parameter.name ?? ''}`
}

function pathParameterKey(name: string): string {
  return `path:${name}`
}

function normalizeBase(base: string): string {
  return base.endsWith('/') ? base : `${base}/`
}

function loadStored<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback
  const value = localStorage.getItem(key)
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function store(key: string, value: unknown) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}
