import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './', plugins: [vue(), { name: 'runtime-api-base', transformIndexHtml(html) {
      const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      return html.replace('<meta name="apiBase" content="">', '<meta name="apiBase" content="' + escape(env.API_BASE || '') + '">')
    } }],
    server: { proxy: env.DEV_API_BASE ? { '/api': { target: env.DEV_API_BASE, changeOrigin: true, ws: true }, '/flags': env.DEV_API_BASE, '/os-icons': env.DEV_API_BASE, '/admin': env.DEV_API_BASE } : undefined },
    build: { assetsInlineLimit: 0 },
  }
})
