// No HTTP polling: bounded reconnects, explicit subscriptions, one UI batch/second.
export function createLive({ base, ids, id = null, token = '', origin = location.origin, onBatch, onStatus, timeoutMinutes = 0, onTimeout = () => {}, WebSocketImpl = WebSocket, timers = globalThis, random = Math.random }) {
  let socket, retryTimer, flushTimer, expiryTimer, stopped = false, attempts = 0
  let pending = []
  const clear = () => { timers.clearTimeout(retryTimer); timers.clearTimeout(flushTimer); timers.clearTimeout(expiryTimer); pending = [] }
  const stop = () => { stopped = true; clear(); if (socket) { socket.onclose = null; socket.close() } }
  function connect() {
    if (stopped) return
    const url = new URL('/api/ws', base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('subscribe', id === null ? 'all' : id)
    if (new URL(base).origin !== origin && token) url.searchParams.set('token', token)
    onStatus('connecting')
    try { socket = new WebSocketImpl(url.href) } catch { reconnect(); return }
    socket.onopen = () => {
      if (stopped) { socket.close(); return }
      onStatus('live')
      if (id === null) socket.send(JSON.stringify({ type: 'subscribe', scope: 'all', ids }))
      if (timeoutMinutes > 0) expiryTimer = timers.setTimeout(() => { stop(); onStatus('paused'); onTimeout() }, timeoutMinutes * 60000)
    }
    socket.onmessage = event => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }
      if (msg.type === 'ping') { socket.send(JSON.stringify({type:'pong',ts:msg.ts})); return }
      if (msg.type !== 'batchUpdate') return
      pending.push(msg)
      // Bound memory even if a browser throttles timers in the background.
      if (pending.length > 120) pending.shift()
      if (!flushTimer) flushTimer = timers.setTimeout(() => {
        flushTimer = null
        const batch = pending; pending = []
        onBatch(batch)
      }, 1000)
    }
    socket.onerror = () => socket.close()
    socket.onclose = event => {
      if (stopped) return
      timers.clearTimeout(expiryTimer)
      if (event.code === 1008 || event.code === 4401 || event.code === 4403) { stop(); onStatus('denied'); return }
      reconnect()
    }
  }
  function reconnect() {
    if (stopped) return
    if (attempts >= 8) { stop(); onStatus('disconnected'); return }
    const delay = Math.min(30000, 1000 * 2 ** attempts++) + Math.floor(random() * 400)
    onStatus('reconnecting')
    retryTimer = timers.setTimeout(connect, delay)
  }
  connect()
  return { stop }
}
