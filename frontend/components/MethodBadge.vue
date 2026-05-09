<script setup lang="ts">
import type { HttpMethod } from '../types/openapi'
import { methodLabel } from '../utils/openapi'

defineProps<{
  method: HttpMethod
}>()
</script>

<template>
  <span class="method-badge" :class="`method-${method}`">{{ methodLabel(method) }}</span>
</template>

<style scoped>
.method-badge {
  display: inline-flex;
  min-width: 48px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  color: white;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
}

.method-get {
  background: #0f9d58;
}

.method-post {
  background: #1677ff;
}

.method-put {
  background: #d97706;
}

.method-delete {
  background: #d92d20;
}

.method-patch {
  background: #7c3aed;
}

.method-head,
.method-options,
.method-trace {
  background: #475467;
}
</style>
