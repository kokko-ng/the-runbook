<script setup lang="ts">
import { computed } from 'vue'

/**
 * A small monogram badge per resource kind.
 *
 * Microsoft permits its Azure architecture icons "in architectural diagrams,
 * training materials, or documentation", which this map arguably is. We ship
 * neutral monograms anyway: it avoids redistributing a third-party asset set
 * inside an application, keeps the bundle small, and keeps one visual language.
 * The diagram is data and the badge is looked up by `kind`, so swapping the
 * official set in later is a change to this file and nothing else.
 */
const KINDS: Record<string, [string, string]> = {
  vnet: ['VN', 'network'],
  subnet: ['SN', 'network'],
  nsg: ['NS', 'network'],
  asg: ['AG', 'network'],
  'route-table': ['RT', 'network'],
  nva: ['NV', 'network'],
  'private-endpoint': ['PE', 'network'],
  'vpn-gateway': ['VG', 'network'],
  bastion: ['BA', 'edge'],
  'load-balancer': ['LB', 'edge'],
  'public-ip': ['IP', 'edge'],
  'nat-gateway': ['NG', 'edge'],
  dns: ['DN', 'edge'],
  'dns-private': ['PD', 'edge'],
  internet: ['WW', 'edge'],
  'front-door': ['FD', 'edge'],
  'traffic-manager': ['TM', 'edge'],
  'application-gateway': ['AW', 'edge'],
  firewall: ['FW', 'edge'],
  expressroute: ['ER', 'edge'],
  vm: ['VM', 'compute'],
  vmss: ['SS', 'compute'],
  disk: ['DK', 'compute'],
  'availability-set': ['AV', 'compute'],
  'app-service': ['AS', 'compute'],
  'app-service-plan': ['SP', 'compute'],
  'deployment-slot': ['DS', 'compute'],
  'container-registry': ['CR', 'compute'],
  'container-instance': ['CI', 'compute'],
  'container-app': ['CA', 'compute'],
  aks: ['KS', 'compute'],
  functions: ['FN', 'compute'],
  batch: ['BT', 'compute'],
  storage: ['ST', 'data'],
  'blob-container': ['BC', 'data'],
  'file-share': ['FS', 'data'],
  'sql-database': ['DB', 'data'],
  'sql-mi': ['MI', 'data'],
  cosmos: ['CS', 'data'],
  'data-lake': ['DL', 'data'],
  'data-factory': ['DF', 'data'],
  synapse: ['SY', 'data'],
  redis: ['RD', 'data'],
  'service-bus': ['SB', 'data'],
  'event-hub': ['EH', 'data'],
  'event-grid': ['EG', 'data'],
  apim: ['AP', 'data'],
  'app-config': ['AC', 'data'],
  'key-vault': ['KV', 'data'],
  entra: ['ID', 'identity'],
  'entra-connect': ['EC', 'identity'],
  'entra-group': ['GR', 'identity'],
  'entra-feature': ['EF', 'identity'],
  'entra-guest': ['GU', 'identity'],
  license: ['LI', 'identity'],
  'managed-identity': ['MU', 'identity'],
  'management-group': ['MG', 'governance'],
  subscription: ['SU', 'governance'],
  'resource-group': ['RG', 'governance'],
  policy: ['PO', 'governance'],
  lock: ['LK', 'governance'],
  budget: ['BU', 'governance'],
  blueprint: ['BP', 'governance'],
  'log-analytics': ['LA', 'ops'],
  'action-group': ['AC', 'ops'],
  alert: ['AL', 'ops'],
  'network-watcher': ['NW', 'ops'],
  'connection-monitor': ['CM', 'ops'],
  'recovery-vault': ['RV', 'ops'],
  'backup-vault': ['BV', 'ops'],
  'site-recovery': ['SR', 'ops'],
  workbook: ['WB', 'ops'],
  onprem: ['DC', 'onprem'],
  'onprem-ad': ['AD', 'onprem'],
  'onprem-app': ['OA', 'onprem'],
  migrate: ['MV', 'onprem'],
}

const TONES: Record<string, string> = {
  network: 'bg-signal-600/15 text-signal-600 dark:text-signal-400',
  edge: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  compute: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
  data: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  identity: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  governance: 'bg-ink-500/15 text-ink-600 dark:text-ink-300',
  ops: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  onprem: 'bg-stone-500/15 text-stone-600 dark:text-stone-300',
  unknown: 'bg-ink-500/15 text-ink-500',
}

const props = defineProps<{ kind: string; size?: 'sm' | 'md' }>()
const meta = computed(() => KINDS[props.kind] ?? ['??', 'unknown'])
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-md font-mono font-semibold"
    :class="[TONES[meta[1]], size === 'sm' ? 'h-5 w-5 text-[0.6rem]' : 'h-7 w-7 text-[0.7rem]']"
    :title="kind"
    aria-hidden="true"
  >
    {{ meta[0] }}
  </span>
</template>
