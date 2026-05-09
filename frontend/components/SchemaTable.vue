<script setup lang="ts">
import type { OpenApiSchema } from '../types/openapi'
import { schemaType } from '../utils/openapi'

defineProps<{
  schema?: OpenApiSchema
}>()
</script>

<template>
  <div v-if="schema?.properties" class="schema-table-wrap">
    <table class="schema-table">
      <thead>
        <tr>
          <th>名称</th>
          <th>类型</th>
          <th>必填</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, name) in schema.properties" :key="String(name)">
          <td>
            <code>{{ name }}</code>
          </td>
          <td>{{ schemaType(item) }}</td>
          <td>{{ schema.required?.includes(String(name)) ? '是' : '否' }}</td>
          <td>{{ item.description || '-' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <pre v-else class="schema-empty">{{ JSON.stringify(schema ?? {}, null, 2) }}</pre>
</template>

<style scoped>
.schema-table-wrap {
  overflow: auto;
  border: 1px solid #e5e7eb;
}

.schema-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.schema-table th,
.schema-table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.schema-table th {
  background: #fafafa;
  color: #344054;
  font-weight: 600;
}

.schema-empty {
  margin: 0;
  overflow: auto;
  border: 1px solid #e5e7eb;
  background: #fbfcfe;
  padding: 12px;
  font-size: 12px;
}
</style>
