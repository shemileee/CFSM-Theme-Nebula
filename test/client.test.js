import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '../src/lib/client.js'

test('config cache, per-backend Turnstile credential, JWT and 401/403 cleanup',async()=>{
 const oldFetch=globalThis.fetch,oldLocation=globalThis.location
 globalThis.location={origin:'https://api.example'}
 const data=new Map([['jwt_token','mock-jwt']])
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
 const calls=[]
 const queue=[{is_public:true,turnstile_enabled:true},{verified:true,turnstile_verified:'encrypted-proof'}, {servers:[]},403,401]
 globalThis.fetch=async(url,opts)=>{calls.push({url:String(url),opts});const value=queue.shift();return typeof value==='number'?new Response('{}',{status:value}):Response.json(value)}
 try {
  const client=createClient('https://api.example',storage)
  await client.loadConfig();await client.loadConfig();assert.equal(calls.length,1)
  await client.verify('one-time-token')
  assert.equal(calls[1].opts.headers['X-Turnstile-Token'],'one-time-token')
  await client.request('/api/servers')
  assert.equal(calls[2].opts.headers['X-Turnstile-Verified'],'encrypted-proof')
  assert.equal(calls[2].opts.headers.Authorization,'Bearer mock-jwt')
  await assert.rejects(client.request('/api/servers'),e=>e.status===403)
  assert.equal(data.has('cfsm_nebula_verified:https://api.example'),false)
  await assert.rejects(client.request('/api/servers'),e=>e.status===401)
  assert.equal(data.has('jwt_token'),false)
 } finally{globalThis.fetch=oldFetch;globalThis.location=oldLocation}
})

test('disabled Turnstile does not send cached verification credentials',async()=>{
 const oldFetch=globalThis.fetch,oldLocation=globalThis.location
 globalThis.location={origin:'https://static.example'}
 const calls=[]
 globalThis.fetch=async(url,opts)=>{calls.push(opts);return Response.json(calls.length===1?{turnstile_enabled:false}:{servers:[]})}
 try{
  const client=createClient('https://api.example',{getItem:k=>k.startsWith('cfsm_nebula_verified')?'old-proof':null,removeItem:()=>{}})
  await client.loadConfig();await client.request('/api/servers')
  assert.equal(calls[1].headers['X-Turnstile-Verified'],undefined)
  assert.equal(calls[1].credentials,'omit')
 }finally{globalThis.fetch=oldFetch;globalThis.location=oldLocation}
})
