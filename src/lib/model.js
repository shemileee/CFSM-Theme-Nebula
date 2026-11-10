export const enabled = v => v === true || v === 'true' || v === 1 || v === '1'
export const finite = v => v !== null && v !== '' && v !== undefined && v !== false && Number.isFinite(Number(v))
export const number = v => finite(v) ? Number(v) : 0
export const MB = 1024 ** 2
export const GB = 1024 ** 3
export const online = (s, now = Date.now()) => number(s.last_updated) > 0 && now - number(s.last_updated) < 300000
export const percent = (used, total) => number(total) > 0 ? Math.max(0, Math.min(100, number(used) / number(total) * 100)) : null
export function bytes(v) {
  if (!finite(v)) return '—'
  let n = Math.max(0, Number(v)), i = 0
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return n.toFixed(i ? 2 : 0) + ' ' + units[i]
}
export const rate = v => finite(v) ? bytes(v) + '/s' : '—'
export const capacity = v => finite(v) ? bytes(Number(v) * MB) : '—'
export function traffic(s) {
  const rx = number(s.net_rx_monthly), tx = number(s.net_tx_monthly)
  const used = s.traffic_calc_type === 'dl' ? rx : s.traffic_calc_type === 'ul' ? tx : s.traffic_calc_type === 'max' ? Math.max(rx, tx) : rx + tx
  const limit = number(s.traffic_limit) * GB
  return { used, limit, percent: percent(used, limit) }
}
export function price(s) {
  if (!finite(s.price)) return '未设置价格'
  if (number(s.price) === 0 || number(s.price) === -1) return '免费'
  const cycles = { month: '月', quarter: '季', half_year: '半年', year: '年', two_years: '2年', three_years: '3年', four_years: '4年', five_years: '5年' }
  return (s.currency || '') + s.price + '/' + (cycles[s.billing_cycle] || s.billing_cycle || '周期')
}
export function expires(s, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.expire_date || '')
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
  return { days, label: days > 3650 ? '长期' : days < 0 ? '已过期' : days === 0 ? '今日到期' : days + ' 天' }
}
export const probeValue = v => v === null ? null : finite(v) ? Number(v) : undefined
export function probes(config) {
  return ['ct','cu','cm','bd','node_1','node_2','node_3','node_4'].map((key, i) => ({ key, name: i < 4 ? config['custom_' + key + '_name'] || ['电信','联通','移动','BGP'][i] : config[key + '_name'] || 'Node ' + (i - 3) }))
}
export function route(hash) {
  const match = /^#\/server\/([^/?#]+)$/.exec(hash)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return null }
}
export const serverKey = (base, id) => JSON.stringify([base, String(id)])
export const adminUrl = base => new URL('/admin#/admin', base).href
export function apiBases(meta, origin) {
  return [...new Set((meta || origin).split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const url = new URL(s)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('apiBase 必须是 HTTP(S) origin，不包含路径或凭据')
    return url.origin
  }))]
}
// Only public documented metric fields may be merged. Samples are partial updates.
const fields = new Set(('cpu load_avg net_in_speed net_out_speed net_rx net_tx net_rx_monthly net_tx_monthly ram_total ram_used swap_total swap_used disk_total disk_used disk gpu_info processes tcp_conn udp_conn cpu_cores cpu_info arch os kernel_version region boot_time agent_version timestamp last_updated ping loss ' + ['ct','cu','cm','bd','node_1','node_2','node_3','node_4'].flatMap(k => ['ping_' + k, 'loss_' + k]).join(' ')).split(' '))
export function applyBatch(servers, message) {
  if (message?.type !== 'batchUpdate' || !Array.isArray(message.updates)) return servers
  const map = new Map(servers.map(s => [String(s.id), { ...s }]))
  for (const update of message.updates) {
    const s = map.get(String(update.serverId))
    if (!s || !Array.isArray(update.samples)) continue
    for (const sample of [...update.samples].filter(x => x && finite(x.ts)).sort((a,b) => Number(a.ts) - Number(b.ts))) {
      if (Number(sample.ts) < number(s.timestamp)) continue
      const data = sample.data || sample.payload || sample.metrics
      if (!data || typeof data !== 'object') continue
      for (const [key, value] of Object.entries(data)) if (fields.has(key) && value !== undefined) s[key] = value
      s.timestamp = Number(sample.ts)
      // reportTs (when present) is newer than buffered sample timestamps.
      s.last_updated = Math.max(number(s.last_updated), number(update.reportTs), Number(sample.ts))
    }
  }
  return [...map.values()]
}
