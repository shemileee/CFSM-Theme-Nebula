<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { Alert, Button } from 'ant-design-vue'
const props = defineProps({ site: Object })
const emit = defineEmits(['verified'])
const container = ref(null), error = ref(''), busy = ref(false)
let widget, disposed = false
let controller = new AbortController()
async function mountWidget() {
  error.value = ''
  try {
    if (!props.site.config.turnstile_site_key) throw new Error('站点未配置 Turnstile 公钥，请联系管理员')
    if (!window.turnstile) await new Promise((resolve,reject)=>{
      let script=document.querySelector('script[data-nebula-turnstile]')
      if (!script) {script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.dataset.nebulaTurnstile='1';document.head.appendChild(script)}
      const timer=setTimeout(()=>reject(new Error('验证组件加载超时，请检查网络或 CSP')),15000)
      script.addEventListener('load',()=>{clearTimeout(timer);resolve()}, {once:true})
      script.addEventListener('error',()=>{clearTimeout(timer);script.remove();reject(new Error('验证组件加载失败'))}, {once:true})
    })
    if (disposed) return
    if (widget !== undefined) window.turnstile.remove(widget)
    widget=window.turnstile.render(container.value,{ sitekey:props.site.config.turnstile_site_key, callback:async token=>{
      busy.value=true
      try { await props.site.client.verify(token,controller.signal);emit('verified') } catch(e) { if (!disposed) {error.value=e.message;window.turnstile.reset(widget)} } finally {busy.value=false}
    }, 'error-callback':()=>{error.value='验证未完成，请重试'}, 'expired-callback':()=>window.turnstile.reset(widget) })
  } catch(e) { if(!disposed) error.value=e.message }
}
onMounted(mountWidget)
onBeforeUnmount(()=>{disposed=true;controller.abort();if(widget!==undefined)window.turnstile?.remove(widget)})
</script>
<template><div class="verification"><h3>{{ site.config.site_title || '站点' }} · 人机验证</h3><div ref="container"/><p v-if="busy">正在验证…</p><Alert v-if="error" type="warning" :message="error" show-icon/><Button v-if="error" @click="mountWidget">重新加载验证</Button></div></template>
