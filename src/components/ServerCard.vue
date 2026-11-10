<script setup>
import { computed, ref } from 'vue'
import { Button, Card, Tag } from 'ant-design-vue'
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons-vue'
import PixelMeter from './PixelMeter.vue'
import SparkBars from './SparkBars.vue'
import { bytes, capacity, rate, number, finite, online, percent, traffic, price, expires, probes, probeValue, enabled } from '../lib/model.js'
const props = defineProps({ server: Object, config: Object, sys: Object, now: Number, speeds: { default: () => [] } })
const emit = defineEmits(['open'])
const alive = computed(() => online(props.server, props.now))
const expiry = computed(() => expires(props.server, new Date(props.now)))
const usage = computed(() => traffic(props.server))
const meters = computed(() => [
  { name: 'CPU', value: finite(props.server.cpu) ? number(props.server.cpu) : null, detail: props.server.cpu_cores ? props.server.cpu_cores + ' 核 · Load ' + (props.server.load_avg || '—') : '尚未上报', color: 'blue' },
  { name: '内存', value: percent(props.server.ram_used, props.server.ram_total), detail: capacity(props.server.ram_used) + ' / ' + capacity(props.server.ram_total), color: 'violet' },
  { name: '磁盘', value: percent(props.server.disk_used, props.server.disk_total), detail: capacity(props.server.disk_used) + ' / ' + capacity(props.server.disk_total), color: 'orange' },
  ...(number(props.server.swap_total) > 0 ? [{ name: 'Swap', value: percent(props.server.swap_used, props.server.swap_total), detail: capacity(props.server.swap_used) + ' / ' + capacity(props.server.swap_total), color: 'cyan' }] : []),
])
const lines = computed(() => !enabled(props.sys?.show_three_net_details) ? [] : probes(props.config).map(p => ({ ...p, value: probeValue(props.server['ping_' + p.key]), loss: probeValue(props.server['loss_' + p.key]), points: (props.server.ping || []).filter(v => probeValue(v[p.key]) !== undefined).map(v => ({ ts: v.ts, value: probeValue(v[p.key]) })) })).filter(p => p.value !== undefined || p.points.length))
const expanded = ref(false)
const visibleLines = computed(() => expanded.value ? lines.value : lines.value.slice(0, 2))
const lossColor = v => v === undefined || v === null ? '' : v === 0 ? 'good' : v < 1 ? 'warn' : v < 5 ? 'slow' : 'bad'
const lossLabel = v => v === undefined || v === null ? '无数据' : v.toFixed(1) + '%'
const lossPoints = p => (props.server.loss || []).map(v => ({ts:v.ts,value:probeValue(v[p.key])}))
const heatColor = v => v === null ? 'timeout' : v === undefined ? '' : v < 80 ? 'good' : v < 150 ? 'warn' : v < 250 ? 'slow' : 'bad'
const region = computed(() => /^[a-z]{2}$/i.test(props.server.region || '') ? props.server.region.toLowerCase() : '')
const tags = computed(() => String(props.server.tags || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3))
const show = key => props.sys?.[key] === undefined || enabled(props.sys[key])
</script>
<template>
<Card class="server-card" :bordered="false">
  <div class="node-heading"><span class="status-dot" :class="{online:alive}" :title="alive ? '在线' : '离线'" /><img v-if="region" class="flag" :src="server._base + '/flags/' + region + '.svg'" alt="" @error="$event.target.style.display='none'" /><button class="node-name" @click="emit('open',server)">{{ server.name || server.id }}</button><span v-if="show('show_expire') && expiry" class="expiry" :class="expiry.days <= 7 ? 'danger' : expiry.days <= 30 ? 'warning' : 'healthy'">{{ expiry.label }}</span></div>
  <div class="node-meta"><span>{{ server.os || '等待探针上报' }}</span><span v-if="show('show_price')">{{ price(server) }}</span></div>
  <div v-if="tags.length" class="tags"><Tag v-for="t in tags" :key="t" color="purple">{{ t }}</Tag></div>
  <div class="resources"><div v-for="m in meters" :key="m.name" class="resource"><div class="split"><span>{{ m.name }}</span><strong>{{ m.value === null ? '—' : m.value.toFixed(1) + '%' }}</strong></div><PixelMeter :value="m.value" :color="m.color" :label="m.name"/><small>{{ m.detail }}</small></div></div>
  <div class="network"><div class="speed-cell"><span class="muted"><ArrowDownOutlined/> 下载</span><strong class="blue-text">{{ rate(server.net_in_speed) }}</strong><SparkBars :values="speeds.map(x=>x.rx)" color="blue" /></div><div class="speed-cell"><span class="muted"><ArrowUpOutlined/> 上传</span><strong class="green-text">{{ rate(server.net_out_speed) }}</strong><SparkBars :values="speeds.map(x=>x.tx)" color="green" /></div></div>
  <div v-if="show('show_tf')" class="traffic"><div class="split"><span>本期流量</span><span>{{ bytes(usage.used) }} / {{ usage.limit > 0 ? bytes(usage.limit) : '∞' }}</span></div><PixelMeter :value="usage.limit > 0 ? usage.percent : null" color="pink" label="流量使用率"/><small>↓ {{ bytes(server.net_rx_monthly) }} · ↑ {{ bytes(server.net_tx_monthly) }}</small></div>
  <div v-if="enabled(sys?.show_three_net_details)" class="probe-area"><div class="split muted"><span>线路探测</span><small>{{ config.latency_window?.hours || 2 }} 小时真实采样</small></div><div v-if="!lines.length" class="empty-probes">暂无线路探测</div><div v-for="p in visibleLines" :key="p.key" class="probe-line"><div class="split"><span>{{ p.name }}</span><small>{{ p.value === undefined ? '—' : p.value === null ? '超时' : p.value.toFixed(0) + 'ms' }} · 丢包 {{ lossLabel(p.loss) }}</small></div><div class="heat-row"><span>延迟</span><div v-if="p.points.length" class="heatmap"><i v-for="(point,i) in p.points" :key="i" :class="heatColor(point.value)" :title="new Date(point.ts).toLocaleString() + ' · ' + (point.value === null ? '超时' : point.value + 'ms')" /></div><span v-else class="no-samples">无采样</span></div><div class="heat-row"><span>丢包</span><div v-if="lossPoints(p).length" class="heatmap"><i v-for="(point,i) in lossPoints(p)" :key="i" :class="lossColor(point.value)" :title="new Date(point.ts).toLocaleString() + ' · ' + lossLabel(point.value)" /></div><span v-else class="no-samples">无采样</span></div></div><Button v-if="lines.length > 2" type="text" size="small" class="probe-toggle" :aria-expanded="expanded" @click="expanded=!expanded">{{ expanded ? '收起线路 ⌃' : '展开其余 ' + (lines.length-2) + ' 条线路 ⌄' }}</Button></div>
  <div class="card-bottom"><span :class="alive ? 'healthy' : 'danger'">{{ alive ? '在线' : '离线' }}</span><button class="text-button" @click="emit('open',server)">查看详情 →</button></div>
</Card>
</template>
