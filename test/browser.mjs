import { chromium } from 'playwright'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const server=await createServer({server:{host:'127.0.0.1',port:5179,strictPort:true}})
await server.listen()
const browser=await chromium.launch({channel:'chrome',headless:true})
const errors=[]
const fixtures=[
 {id:'us-uuid',name:'US · Nebula One',region:'US',server_group:'海外',tags:'生产,高带宽',os:'Debian 13',cpu_info:'AMD EPYC',cpu_cores:4,arch:'x86_64',cpu:24.5,ram_total:8192,ram_used:3200,swap_total:2048,swap_used:64,disk_total:102400,disk_used:34560,net_in_speed:2200000,net_out_speed:600000,net_rx_monthly:20*1024**3,net_tx_monthly:10*1024**3,traffic_limit:'500',traffic_calc_type:'total',load_avg:'0.12 0.20 0.18',price:'9.99',currency:'$',billing_cycle:'month',expire_date:'2026-12-31',ping_ct:90,ping_cu:0,ping_cm:null,loss_ct:0,loss_cu:0,loss_cm:100},
 {id:'hk-uuid',name:'HK · Cloud Edge',region:'HK',server_group:'海外',tags:'边缘',os:'Ubuntu 24.04',cpu:7,ram_total:4096,ram_used:1024,disk_total:40960,disk_used:9500,net_in_speed:300000,net_out_speed:950000,traffic_limit:'1000',price:'0',ping_ct:35,loss_ct:0},
 {id:'cn-uuid',name:'CN · Home Lab',region:'CN',server_group:'家庭',os:'Debian 12',cpu:51,ram_total:16384,ram_used:8800,disk_total:204800,disk_used:55300,net_in_speed:0,net_out_speed:0,price:'',traffic_limit:'0'},
]
let checks=0
async function scenario({privateSite=false,turnstile=false,authenticated=false,mobile=false}={}) {
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},colorScheme:'light'})
 const page=await context.newPage()
 page.on('pageerror',e=>errors.push(e.message))
 const calls=[],subscriptions=[]
 let proof=false
 if(authenticated) await context.addInitScript(()=>localStorage.setItem('jwt_token','mock-jwt'))
 await page.route('**/flags/*.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><path fill="#6366f1" d="M0 0h30v20H0z"/></svg>'}))
 await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({contentType:'application/javascript',body:`window.turnstile={render(el,opts){setTimeout(()=>opts.callback('mock-turnstile-token'),30);return 'mock'},remove(){},reset(){}};`}))
 await page.route('**/api/**',async r=>{
  const req=r.request(),url=new URL(req.url());calls.push(url.pathname+url.search)
  const headers=req.headers()
  if(url.pathname==='/api/config') {
   if(headers['x-turnstile-token']==='mock-turnstile-token')proof=true
   return r.fulfill({json:{site_title:'Nebula Observatory',version:'2.8.6',is_public:!privateSite,authorization:authenticated,turnstile_enabled:turnstile,turnstile_site_key:'test-key',verified:proof||headers['x-turnstile-verified']==='proof',turnstile_verified:proof?'proof':null,frontend_ws_timeout_minutes:0,latency_window:{hours:2,points:20}}})
  }
  if(privateSite&&!authenticated)return r.fulfill({status:401,json:{}})
  if(turnstile&&!headers['x-turnstile-verified'])return r.fulfill({status:403,json:{}})
  const now=Date.now()
  const rows=fixtures.map((s,i)=>({...s,last_updated:now-(i===2?400000:0),timestamp:now,ping_node_1:null,loss_node_1:null,ping_node_2:null,loss_node_2:false,ping_node_3:null,loss_node_3:null,ping_node_4:null,loss_node_4:null,net_rx_monthly:s.net_rx_monthly||0,net_tx_monthly:s.net_tx_monthly||0,ping:[...Array(14)].map((_,j)=>({ts:now-(14-j)*360000,ct:i===0?70+j*5:30,cu:0,cm:j===5?null:110})),loss:[...Array(14)].map((_,j)=>({ts:now-(14-j)*360000,ct:j===5?null:0,cu:0,cm:100}))}))
  if(url.pathname==='/api/servers')return r.fulfill({json:{servers:rows,stats:{total:3,online:2,offline:1},sysConfig:{show_three_net_details:true,show_price:true,show_expire:true,show_tf:true}}})
  if(url.pathname==='/api/server')return r.fulfill({json:{...rows.find(s=>s.id===url.searchParams.get('id')),sysConfig:{show_three_net_details:true}}})
  if(url.pathname==='/api/history/all')return r.fulfill({json:[...Array(20)].map((_,i)=>({timestamp:now-(20-i)*30000,cpu:20+i,ram_used:3000+i*5,swap_used:64,net_in_speed:100000+i*10000,net_out_speed:50000, disk_used:34560,ping_ct:i===8?null:80+i,loss_ct:0,ping_cu:0,loss_cu:0}))})
  return r.fulfill({status:404,json:{}})
 })
 await page.routeWebSocket('**/api/ws?**',ws=>{
  subscriptions.push(ws.url())
  ws.onMessage(message=>{
   const msg=JSON.parse(message)
   if(msg.type==='subscribe')ws.send(JSON.stringify({type:'batchUpdate',updates:[{serverId:'us-uuid',samples:[{ts:Date.now()+1000,data:{cpu:42}}]}]}))
  })
 })
 await page.goto('http://127.0.0.1:5179/')
 if(privateSite&&!authenticated) {
  await page.getByText('此站点需要登录').waitFor()
  assert.equal(calls.filter(p=>p.startsWith('/api/servers')).length,0)
  checks++;await context.close();return
 }
 await page.locator('.server-card').first().waitFor()
 assert.equal(await page.locator('.server-card').count(),3)
 const home=page.locator('.server-card').filter({has:page.getByRole('button',{name:'CN · Home Lab',exact:true})})
 assert.equal(await home.locator('.traffic .lit').count(),0,'unlimited traffic must not show full usage')
 assert.equal(await page.locator('.probe-area').first().evaluate(el=>getComputedStyle(el).overflow),'visible')
 assert.equal(await page.locator('.probe-line').first().locator('.heat-row').count(),2,'separate latency and loss rows')
 const expand=page.getByRole('button',{name:'展开其余 1 条线路 ⌄'}).first()
 await expand.click();assert.equal(await page.locator('.probe-line').filter({hasText:/Node [1-4]/}).count(),0,'empty optional nodes hidden');assert.equal(await page.locator('.probe-area').first().locator('.probe-line').count(),3)
 await page.getByRole('button',{name:'收起线路 ⌃'}).first().click()
 assert.equal(calls.filter(p=>p==='/api/servers').length,1)
 await page.waitForTimeout(1250)
 await page.getByRole('button',{name:'US · Nebula One',exact:true}).waitFor()
 assert.ok((await page.locator('.server-card').filter({has:page.getByRole('button',{name:'US · Nebula One',exact:true})}).locator('.resources').textContent()).includes('42.0%'))
 const listCalls=calls.length
 await page.waitForTimeout(2200)
 assert.equal(calls.length,listCalls,'no polling')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow')
 if(!privateSite&&!turnstile) {
  await mkdir('test-results',{recursive:true})
  await page.screenshot({path:mobile?'test-results/mobile.png':'test-results/desktop.png',fullPage:true})
 }
 await page.getByLabel('搜索服务器').fill('Home Lab');assert.equal(await page.locator('.server-card').count(),1)
 await page.getByLabel('搜索服务器').fill('')
 await page.getByRole('button',{name:'US · Nebula One',exact:true}).click()
 await page.locator('canvas').first().waitFor()
 assert.equal(calls.filter(p=>p.startsWith('/api/server?')).length,1)
 assert.equal(calls.filter(p=>p.startsWith('/api/history/all')).length,1)
 assert.ok(subscriptions.at(-1).includes('subscribe=us-uuid'))
 assert.ok(calls.at(-1).includes('hours=0.167'))
 await page.getByText('网络延迟',{exact:true}).click()
 assert.equal(calls.filter(p=>p.startsWith('/api/history/all')).length,1,'tab reuses history')
 await page.getByLabel('切换深色').click();assert.equal(await page.locator('html').getAttribute('class'),'dark')
 if(!privateSite&&!turnstile&&!mobile)await page.screenshot({path:'test-results/detail-dark.png',fullPage:true})
 await page.reload();await page.locator('canvas').first().waitFor()
 assert.equal(calls.filter(p=>p==='/api/servers').length,1,'direct detail refresh never loads full list')
 checks++;await context.close()
}
try{
 await scenario();await scenario({mobile:true})
 await scenario({turnstile:true})
 await scenario({privateSite:true})
 await scenario({privateSite:true,authenticated:true})
 await scenario({privateSite:true,authenticated:true,turnstile:true})
 assert.deepEqual(errors,[])
 console.log('PASS '+checks+' browser scenarios: desktop/mobile, four auth/Turnstile combinations, live batches, no polling, routes, charts, dark mode.')
}finally{await browser.close();await server.close()}
