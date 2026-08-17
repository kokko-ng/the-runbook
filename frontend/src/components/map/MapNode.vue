<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

import type { DiagramNode, NodeStatus } from '@/engine/types'

const props = defineProps<{ data: DiagramNode }>()

/**
 * Kinds are grouped into a handful of families rather than given per-service
 * icons: the map's job is to show what broke and how things connect, and a
 * legible two-letter tag reads better at phone scale than a 16px logo.
 */
const FAMILY: Record<string, string> = {
  subscription: 'SUB',
  'resource-group': 'RG',
  'management-group': 'MG',
  vnet: 'VN',
  subnet: 'SN',
  nsg: 'SEC',
  'route-table': 'RT',
  'vpn-gateway': 'GW',
  firewall: 'FW',
  'load-balancer': 'LB',
  'app-gateway': 'AGW',
  'public-ip': 'IP',
  'private-endpoint': 'PE',
  'dns-zone': 'DNS',
  vm: 'VM',
  vmss: 'VMSS',
  'app-service': 'APP',
  'function-app': 'FN',
  aks: 'AKS',
  'container-app': 'ACA',
  'storage-account': 'ST',
  'sql-database': 'SQL',
  'cosmos-db': 'COS',
  'key-vault': 'KV',
  'entra-id': 'ID',
  'log-analytics': 'LAW',
  monitor: 'MON',
  'backup-vault': 'BKP',
  'recovery-vault': 'RSV',
  policy: 'POL',
  user: 'USR',
  'on-premises': 'DC',
  internet: 'WWW',
}

const STATUS_RING: Record<NodeStatus, string> = {
  healthy: 'border-[var(--rule-strong)]',
  warning: 'border-[var(--color-hivis-500)]',
  broken: 'border-[var(--color-broken)]',
  degraded: 'border-[var(--color-degraded)]',
  planned: 'border-dashed border-[var(--rule)]',
}

const STATUS_TAG: Record<NodeStatus, string> = {
  healthy: 'bg-[var(--surface-sunken)] text-[var(--ink-muted)]',
  warning: 'bg-[var(--color-hivis-500)] text-[var(--color-steel-950)]',
  broken: 'bg-[var(--color-broken)] text-white',
  degraded: 'bg-[var(--color-degraded)] text-white',
  planned: 'bg-transparent text-[var(--ink-faint)]',
}

const tag = computed(() => FAMILY[props.data.kind] ?? props.data.kind.slice(0, 3).toUpperCase())
const attention = computed(
  () => props.data.status === 'broken' || props.data.status === 'warning',
)
</script>

<template>
  <div
    class="flex w-[172px] items-center gap-2 border bg-[var(--surface-raised)] px-2 py-1.5"
    :class="[STATUS_RING[data.status], attention ? 'shadow-sm' : '']"
    style="border-radius: var(--radius-card)"
  >
    <Handle type="target" :position="Position.Top" class="!opacity-0" />
    <span
      class="readout shrink-0 px-1 py-0.5 text-[0.625rem] font-medium tracking-wide"
      :class="STATUS_TAG[data.status]"
      style="border-radius: 2px"
    >
      {{ tag }}
    </span>
    <span class="min-w-0 flex-1 truncate text-[0.75rem] leading-tight" :title="data.label">
      {{ data.label }}
    </span>
    <Handle type="source" :position="Position.Bottom" class="!opacity-0" />
  </div>
</template>
