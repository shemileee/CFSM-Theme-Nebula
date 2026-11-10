<script setup>
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { ConfigProvider, theme, Button, Alert, Input, Select, Segmented, Spin, Empty, Card } from 'ant-design-vue'
import { CloudOutlined as MoonOutlined, BulbOutlined as SunOutlined, SettingOutlined, ReloadOutlined, ArrowLeftOutlined, DashboardOutlined, HddOutlined, StockOutlined, SwapOutlined } from '@ant-design/icons-vue'
import ServerCard from './components/ServerCard.vue'
const HistoryChart = defineAsyncComponent(() => import('./components/HistoryChart.vue'))
import TurnstileGate from './components/TurnstileGate.vue'
import { createClient } from './lib/client.js'
import { createLive } from './lib/live.js'
import { apiBases, adminUrl, applyBatch, bytes, rate, number, finite, enabled, online, probes, probeValue, probeVisible, route, serverKey } from './lib/model.js'

const pageOrigin = location.origin
const sites = shallowRef([]), servers = shallowRef([]), history = shallowRef([]), stats = ref({}), statuses = ref({}), failures = ref({})
const loading = ref(true), historyLoading = ref(false), error = ref(''), search = ref(''), group = ref('*'), hours = ref(0.167), tab = ref('资源')
const selectedId = ref(route(location.hash)), selectedBase = ref(new URLSearchParams(location.hash.split('?')[1] || '').get('site') || '')
const now = ref(Date.now()), savedTheme = ref(localStorage.getItem('cfsm_nebula_appearance'))
const media = matchMedia('(prefers-color-scheme: dark)'), systemDark = ref(media.matches)
const firstConfig = computed(() => sites.value[0]?.config || {})
const dark = computed(() => (savedTheme.value || firstConfig.value.preferred_theme || 'auto') === 'dark' || ((savedTheme.value || firstConfig.value.preferred_theme || 'auto') === 'auto' && systemDark.value))
const current = computed(() => servers.value.find(s => s.id === selectedId.value && (!selectedBase.value || s._base === selectedBase.value)))
const currentSite = computed(() => sites.value.find(s => s.base === (current.value?._base || selectedBase.value)) || sites.value[0])
const groupOptions = computed(() => [{label:'全部节点',value:'*'}, ...[...new Set(servers.value.map(s=>s.server_group || '未分组'))].map(g=>({label:g,value:g}))])
const filtered = computed(() => servers.value.filter(s => (group.value === '*' || (s.server_group || '未分组') === group.value) && [s.name,s.region,s.tags,s.os].join(' ').toLowerCase().includes(search.value.toLowerCase())).sort((a,b)=>number(a.sort_order)-number(b.sort_order) || String(a.id).localeCompare(String(b.id))))
const totals = computed(() => {
  const list = Object.values(stats.value)
  return {total:list.reduce((n,s)=>n+number(s.total),0),online:list.reduce((n,s)=>n+number(s.online),0),offline:list.reduce((n,s)=>n+number(s.offline),0),rx:servers.value.reduce((n,s)=>n+(online(s,now.value)?number(s.net_in_speed):0),0),tx:servers.value.reduce((n,s)=>n+(online(s,now.value)?number(s.net_out_speed):0),0),rxTraffic:servers.value.reduce((n,s)=>n+number(s.net_rx_monthly),0),txTraffic:servers.value.reduce((n,s)=>n+number(s.net_tx_monthly),0),traffic:servers.value.reduce((n,s)=>n+number(s.net_rx_monthly)+number(s.net_tx_monthly),0)}
})
const speeds = shallowRef(new Map())
const busyServer = computed(()=>servers.value.filter(s=>online(s,now.value)).sort((a,b)=>number(b.cpu)-number(a.cpu))[0])
const activeProbes = computed(()=>probes({...currentSite.value?.config,...currentSite.value?.sys}).filter(p=>current.value && probeVisible(current.value,p.key)).filter(p=>history.value.some(r=>probeValue(r['ping_'+p.key]) !== undefined)))
const colorList = ['#3b82f6','#8b5cf6','#f97316','#06b6d4','#22c55e','#eab308','#ec4899','#ef4444']
const metric = (key, scale=1) => r => finite(r[key]) ? Number(r[key]) / scale : null
const charts = computed(()=>tab.value === '资源' ? [
  {title:'CPU 使用率',unit:'%',series:[{label:'CPU',color:colorList[0],read:metric('cpu')}]},
  {title:'内存与 Swap',unit:'GB',series:[{label:'内存',color:colorList[1],read:metric('ram_used',1024)},{label:'Swap',color:colorList[3],read:metric('swap_used',1024)}]},
  {title:'网络速率',unit:'MB/s',series:[{label:'下载',color:colorList[0],read:metric('net_in_speed',1024**2)},{label:'上传',color:colorList[1],read:metric('net_out_speed',1024**2)}]},
  ...(history.value.some(r=>finite(r.disk_used)) ? [{title:'磁盘使用量',unit:'GB',series:[{label:'已用空间',color:colorList[2],read:metric('disk_used',1024)}]}] : []),
  ...(history.value.some(r=>r.disk && Object.values(r.disk).some(v=>number(v)>0)) ? [{title:'磁盘 IO',unit:'MB/s',series:[{label:'读取',color:colorList[3],read:r=>r.disk ? metric('read_bps',1024**2)(r.disk):null},{label:'写入',color:colorList[2],read:r=>r.disk ? metric('write_bps',1024**2)(r.disk):null}]}] : []),
] : [
  {title:'网络延迟',unit:'ms',series:activeProbes.value.map((p,i)=>({label:p.name,color:colorList[i],read:r=>probeValue(r['ping_'+p.key]) ?? null}))},
  {title:'丢包率',unit:'%',series:activeProbes.value.map((p,i)=>({label:p.name,color:colorList[i],read:r=>probeValue(r['loss_'+p.key]) ?? null}))},
])
let controller, historyController, generation = 0, historyGeneration = 0, streams = [], clock, disposed = false
let visibilityTimer
const stateNames = {connecting:'连接中',live:'实时连接',reconnecting:'正在重连',disconnected:'连接中断',denied:'订阅被拒绝',paused:'已暂停'}
function updateSite(base, fields) { sites.value=sites.value.map(s=>s.base===base?{...s,...fields}:s) }
function stopStreams() { streams.forEach(s=>s.stop());streams=[] }
function updateRows(base, rows) {
  const converted=rows.map(s=>({...s,id:String(s.id),_base:base}))
  servers.value=[...servers.value.filter(s=>s._base!==base),...converted]
  sampleSpeeds(base)
}
function sampleSpeeds(base) {
  const map=new Map(speeds.value)
  for(const s of servers.value.filter(s=>s._base===base)) {
    const key=serverKey(base,s.id), values=map.get(key)||[]
    map.set(key,[...values,{rx:number(s.net_in_speed),tx:number(s.net_out_speed)}].slice(-30))
  }
  speeds.value=map
}
function startStream(site, id, ids, gen) {
  if(document.hidden || gen!==generation) return
  streams.push(createLive({base:site.base,ids,id,token:site.client.token(),timeoutMinutes:number(site.config.frontend_ws_timeout_minutes),onStatus:status=>{if(gen===generation) statuses.value={...statuses.value,[site.base]:status}},onTimeout:()=>{},onBatch:messages=>{
    if(gen!==generation)return
    let rows=servers.value.filter(s=>s._base===site.base)
    for(const message of messages) rows=applyBatch(rows,message)
    updateRows(site.base,rows)
    now.value=Date.now()
    // Keep the backend's five-minute online definition after incremental pushes.
    if (selectedId.value === null) {
      const count = rows.filter(s=>online(s,now.value)).length
      stats.value={...stats.value,[site.base]:{...stats.value[site.base],total:rows.length,online:count,offline:rows.length-count}}
    }
  }}))
}
async function fetchSite(site, gen, signal) {
  if(site.error || site.needsVerify || site.needsLogin) return
  try {
    const detail=selectedId.value !== null
    if(detail && selectedBase.value && selectedBase.value!==site.base)return
    const path=detail?'/api/server?id='+encodeURIComponent(selectedId.value):'/api/servers'
    const data=await site.client.request(path,{signal})
    if(gen!==generation)return
    updateRows(site.base,detail?[data]:(data.servers || []))
    updateSite(site.base,{sys:data.sysConfig || {},error:''})
    failures.value={...failures.value,[site.base]:''}
    if(!detail)stats.value={...stats.value,[site.base]:data.stats || {}}
    startStream(site,detail?selectedId.value:null,detail?[selectedId.value]:(data.servers || []).map(s=>String(s.id)),gen)
  } catch(e) {
    if(signal.aborted || gen!==generation)return
    failures.value={...failures.value,[site.base]:e.message}
    if(e.status===403)updateSite(site.base,{needsVerify:true})
    if(e.status===401)updateSite(site.base,{needsLogin:true})
  }
}
async function loadPage() {
  stopStreams();controller?.abort();historyController?.abort();historyGeneration++
  const gen=++generation
  controller=new AbortController()
  loading.value=true;historyLoading.value=false;error.value='';history.value=[];failures.value={}
  servers.value=[];speeds.value=new Map()
  const signal=controller.signal
  await Promise.all(sites.value.map(site=>fetchSite(site,gen,signal)))
  if(gen!==generation)return
  loading.value=false
  if(selectedId.value!==null && current.value) await loadHistory()
}
async function loadHistory() {
  historyController?.abort()
  const site=currentSite.value, id=selectedId.value
  if(!site || !id || !current.value)return
  const seq=++historyGeneration
  historyController=new AbortController();historyLoading.value=true;error.value=''
  const signal=historyController.signal
  try {
    const rows=await site.client.request('/api/history/all?id='+encodeURIComponent(id)+'&hours='+hours.value,{signal})
    if(seq!==historyGeneration)return
    history.value=(Array.isArray(rows)?rows:[]).filter(r=>finite(r.timestamp)).sort((a,b)=>number(a.timestamp)-number(b.timestamp))
  } catch(e) {
    if(seq!==historyGeneration || signal.aborted)return
    error.value=e.message
    if(e.status===403)updateSite(site.base,{needsVerify:true})
    if(e.status===401)updateSite(site.base,{needsLogin:true})
  } finally { if(seq===historyGeneration)historyLoading.value=false }
}
async function init() {
  const gen=++generation
  loading.value=true;error.value=''
  controller?.abort();controller=new AbortController()
  try {
    const bases=apiBases(document.querySelector('meta[name="apiBase"]')?.content,location.origin)
    const clients=bases.map(base=>createClient(base))
    const results=await Promise.all(clients.map(async client=>{
      try {
        const config=await client.loadConfig(controller.signal)
        return {base:client.base,client,config,sys:{},needsVerify:enabled(config.turnstile_enabled)&&!enabled(config.verified),needsLogin:!enabled(config.is_public)&&!enabled(config.authorization)}
      }catch(e){return {base:client.base,client,config:{},sys:{},error:e.message}}
    }))
    if(disposed || gen!==generation)return
    sites.value=results
    await loadPage()
  }catch(e){if(!disposed)error.value=e.message}finally{if(!disposed)loading.value=false}
}
async function verified(base) { const site=sites.value.find(s=>s.base===base);updateSite(base,{config:site.client.config,needsVerify:false});await loadPage() }
function open(server) { location.hash='/server/'+encodeURIComponent(server.id)+'?site='+encodeURIComponent(server._base) }
function back() {location.hash='/'}
function syncRoute() {
  const raw=location.hash.split('?')[0]
  selectedId.value=route(raw)
  selectedBase.value=new URLSearchParams(location.hash.split('?')[1]||'').get('site') || ''
  hours.value=0.167;tab.value='资源';loadPage();window.scrollTo(0,0)
}
function toggleTheme() {savedTheme.value=dark.value?'light':'dark';localStorage.setItem('cfsm_nebula_appearance',savedTheme.value)}
function visibility() {
  clearTimeout(visibilityTimer)
  if(document.hidden){stopStreams();controller?.abort();historyController?.abort();historyGeneration++;generation++;statuses.value={}}
  else visibilityTimer=setTimeout(loadPage,150)
}
const mediaChange=e=>{systemDark.value=e.matches}
watch(dark,v=>document.documentElement.classList.toggle('dark',v),{immediate:true})
watch([current,firstConfig],()=>{document.title=[current.value?.name,firstConfig.value.site_title || 'Nebula'].filter(Boolean).join(' · ')})
onMounted(()=>{
  selectedId.value=route(location.hash.split('?')[0])
  init();clock=setInterval(()=>{now.value=Date.now()},10000)
  addEventListener('hashchange',syncRoute);document.addEventListener('visibilitychange',visibility);media.addEventListener('change',mediaChange)
})
onBeforeUnmount(()=>{disposed=true;generation++;stopStreams();controller?.abort();historyController?.abort();clearInterval(clock);clearTimeout(visibilityTimer);removeEventListener('hashchange',syncRoute);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',mediaChange)})
</script>

<template>
<ConfigProvider :theme="{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,token:{colorPrimary:'#7c5ce7',borderRadius:12,fontFamily:'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'}}">
<div class="app-shell">
<header class="site-header"><div class="header-inner"><button class="brand" @click="back">{{ firstConfig.site_title || 'Nebula' }}<span class="brand-caption">SERVER MONITOR</span></button><div class="header-actions"><span class="connection-label"><i class="status-dot" :class="{online:Object.values(statuses).some(s=>s==='live')}"/>{{ Object.values(statuses).some(s=>s==='live') ? '实时监控' : '等待连接' }}</span><Button aria-label="重新连接" @click="loadPage"><ReloadOutlined/></Button><Button :href="adminUrl(currentSite?.base || sites[0]?.base || pageOrigin)"><SettingOutlined/>后台</Button><Button :aria-label="dark?'切换浅色':'切换深色'" @click="toggleTheme"><SunOutlined v-if="dark"/><MoonOutlined v-else/></Button></div></div></header>
<main class="main-content">
  <Alert v-if="error" :message="error" type="error" show-icon class="notice"/>
  <template v-for="site in sites" :key="site.base">
    <Alert v-if="site.error" :message="site.base + '：' + site.error" type="error" show-icon class="notice"/>
    <Alert v-if="site.needsLogin" type="warning" show-icon class="notice"><template #message>此站点需要登录 <a :href="adminUrl(site.base)">进入原管理后台登录</a>，登录后返回并刷新。</template></Alert>
    <TurnstileGate v-else-if="site.needsVerify" :site="site" @verified="verified(site.base)"/>
    <Alert v-if="failures[site.base]" :message="site.base + '：' + failures[site.base]" type="warning" class="notice"/>
    <Alert v-if="['paused','disconnected','denied','reconnecting'].includes(statuses[site.base])" :type="statuses[site.base]==='reconnecting'?'info':'warning'" class="notice"><template #message>{{ stateNames[statuses[site.base]] }} · {{ site.config.site_title || site.base }}。当前保留最后一次数据。<Button v-if="statuses[site.base]!=='reconnecting'" size="small" @click="loadPage">继续连接</Button></template></Alert>
  </template>
  <Spin v-if="loading" class="page-spinner" tip="正在加载服务器…"/>
  <template v-else-if="selectedId === null">
    <div class="page-title"><div><p class="eyebrow">INFRASTRUCTURE OVERVIEW</p><h1>一览你的服务器</h1><p class="muted">资源状态、网络流量与线路质量，一目了然。</p></div><Button @click="loadPage"><ReloadOutlined/>重新连接</Button></div>
    <div class="summary-grid"><Card :bordered="false" class="summary-card"><div class="summary-icon"><DashboardOutlined/></div><div><small>实时网速</small><span class="summary-value blue-text">↓ {{ rate(totals.rx) }}</span><span class="summary-value green-text">↑ {{ rate(totals.tx) }}</span></div></Card><Card :bordered="false" class="summary-card"><div class="summary-icon"><HddOutlined/></div><div><small>节点</small><strong class="summary-value">{{ totals.online }} <span>/ {{ totals.total }}</span></strong><small>{{ totals.offline ? totals.offline + ' 台离线' : '全部在线' }}</small></div></Card><Card :bordered="false" class="summary-card"><div class="summary-icon"><StockOutlined/></div><div><small>最忙节点</small><span class="summary-value">{{ busyServer ? number(busyServer.cpu).toFixed(1)+'%' : '—' }}</span><small class="truncate summary-node-name">{{ busyServer?.name || '—' }}</small></div></Card><Card :bordered="false" class="summary-card"><div class="summary-icon"><SwapOutlined/></div><div><small>总流量</small><span class="summary-value blue-text">↓ {{ bytes(totals.rxTraffic) }}</span><span class="summary-value green-text">↑ {{ bytes(totals.txTraffic) }}</span></div></Card></div>
    <div class="toolbar"><Segmented v-model:value="group" :options="groupOptions" class="group-selector"/><Input v-model:value="search" allow-clear placeholder="搜索名称、区域、标签…" aria-label="搜索服务器" class="search-input"/></div>
    <div v-if="filtered.length" class="server-grid"><ServerCard v-for="s in filtered" :key="serverKey(s._base,s.id)" :server="s" :config="sites.find(x=>x.base===s._base)?.config || {}" :sys="sites.find(x=>x.base===s._base)?.sys || {}" :now="now" :speeds="speeds.get(serverKey(s._base,s.id)) || []" @open="open"/></div><Empty v-else description="暂无可显示的服务器"/>
  </template>
  <template v-else-if="current">
    <div class="page-title"><div><Button type="text" @click="back"><ArrowLeftOutlined/>返回概览</Button><h1>{{ current.name }}</h1><p class="muted">{{ current.cpu_info || '—' }} · {{ current.arch || '—' }} · {{ current.os || '—' }}</p></div></div>
    <div class="detail-layout"><ServerCard :server="current" :config="currentSite.config" :sys="currentSite.sys" :now="now" :speeds="speeds.get(serverKey(current._base,current.id)) || []"/><Card class="detail-charts" :bordered="false"><div class="chart-toolbar"><Segmented v-model:value="tab" :options="['资源','网络延迟']"/><Select v-model:value="hours" aria-label="历史时间范围" style="width:132px" :options="[{value:0.167,label:'10 分钟'},{value:0.5,label:'30 分钟'},{value:1,label:'1 小时'},{value:6,label:'6 小时'},{value:12,label:'12 小时'},{value:24,label:'24 小时'},{value:48,label:'2 天'},{value:96,label:'4 天'},{value:168,label:'7 天'}]" @change="loadHistory"/></div><Spin v-if="historyLoading" class="page-spinner"/><div v-else-if="history.length" class="charts-grid"><template v-for="chart in charts" :key="chart.title"><HistoryChart v-if="chart.series.length" :rows="history" :series="chart.series" :title="chart.title" :unit="chart.unit" :dark="dark"/></template><Empty v-if="tab==='网络延迟' && !activeProbes.length" description="暂无线路探测数据"/></div><Empty v-else description="暂无历史数据"/><p class="muted chart-footnote">历史点为后端实际采样；未配置及超时不会伪装成 0。切换资源/延迟标签不会额外查询。</p></Card></div>
  </template>
  <Empty v-else-if="selectedId !== null" description="服务器不存在、未公开或数据加载失败"><Button @click="back">返回概览</Button></Empty>
  <Button v-if="error && !sites.length" @click="init">重试加载</Button>
</main>
<footer class="site-footer"><a href="https://github.com/huilang-me/CF-Server-Monitor/" target="_blank" rel="noopener noreferrer">Powered by CF-Server-Monitor {{ firstConfig.version }}</a><span> · Nebula 移植版 0.1.3</span></footer>
</div>
</ConfigProvider>
</template>
