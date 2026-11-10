import { enabled } from './model.js'
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
export function createClient(base, storage = localStorage) {
  const key = 'cfsm_nebula_verified:' + base
  const token = () => storage.getItem('jwt_token') || ''
  let config = null
  async function request(path, { signal, verification, plain = false } = {}) {
    const headers = {}
    if (token()) headers.Authorization = 'Bearer ' + token()
    if (!plain && enabled(config?.turnstile_enabled)) {
      const verified = storage.getItem(key)
      if (verification) headers['X-Turnstile-Token'] = verification
      else if (verified) headers['X-Turnstile-Verified'] = verified
    }
    const res = await fetch(new URL(path, base), { headers, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), credentials: new URL(base).origin === location.origin ? 'same-origin' : 'omit', cache: 'no-store' })
    if (!res.ok) {
      if (res.status === 403) storage.removeItem(key)
      throw new HttpError(res.status, ({401:'需要登录，请使用原管理后台登录后返回',403:'人机验证已失效，请重新验证',409:'数据库需要管理员升级',404:'服务器不存在或未公开'})[res.status] || '请求失败（HTTP ' + res.status + '）')
    }
    return res.json()
  }
  return { base, token,
    get config() { return config },
    async loadConfig(signal) {
      if (config) return config
      config = await request('/api/config', { signal, plain: true })
      if (enabled(config.turnstile_enabled) && storage.getItem(key)) {
        try { config = await request('/api/config', { signal }) } catch (e) { if (e.status !== 403) throw e }
      }
      return config
    },
    async verify(value, signal) {
      const result = await request('/api/config', { signal, verification: value })
      if (!result.verified || !result.turnstile_verified) throw new Error('验证未通过，请重试')
      storage.setItem(key, result.turnstile_verified); config = { ...config, ...result }
      return result
    },
    request,
  }
}
