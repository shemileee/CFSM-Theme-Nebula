import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLive } from '../src/lib/live.js'
function harness(overrides={}) {
 const tasks=new Map();let seq=0
 const timers={setTimeout(fn,ms){const id=++seq;tasks.set(id,{fn,ms});return id},clearTimeout(id){tasks.delete(id)}}
 class Socket {static instances=[];constructor(url){this.url=url;this.sent=[];Socket.instances.push(this)}send(v){this.sent.push(JSON.parse(v))}close(){this.closed=true;this.onclose?.({code:1000})}}
 const batches=[],statuses=[]
 const live=createLive({base:'https://api.example',origin:'https://api.example',ids:['uuid'],onBatch:b=>batches.push(b),onStatus:s=>statuses.push(s),timers,WebSocketImpl:Socket,random:()=>0,...overrides})
 const run=ms=>{const entry=[...tasks.entries()].find(([,v])=>v.ms===ms);assert.ok(entry,'timer '+ms);tasks.delete(entry[0]);entry[1].fn()}
 return {Socket,live,batches,statuses,tasks,run}
}
test('explicit all subscription and one-second batching; nonmetric messages do not clear state',()=>{
 const h=harness(),s=h.Socket.instances[0];s.onopen()
 assert.deepEqual(s.sent,[{type:'subscribe',scope:'all',ids:['uuid']}])
 s.onmessage({data:'not json'});s.onmessage({data:JSON.stringify({type:'hello'})})
 for(let i=0;i<3;i++)s.onmessage({data:JSON.stringify({type:'batchUpdate',updates:[]})})
 assert.equal(h.batches.length,0);assert.equal(h.tasks.size,1);h.run(1000);assert.equal(h.batches[0].length,3)
 h.live.stop();assert.equal(h.tasks.size,0)
})
test('single-node subscription and cross-origin authentication',()=>{
 const h=harness({id:'uuid',origin:'https://static.example',token:'test-token'}),s=h.Socket.instances[0]
 const url=new URL(s.url);assert.equal(url.searchParams.get('subscribe'),'uuid');assert.equal(url.searchParams.get('token'),'test-token')
 s.onopen();assert.equal(s.sent.length,0);h.live.stop()
 const same=harness({token:'test-token'});assert.equal(new URL(same.Socket.instances[0].url).searchParams.has('token'),false);same.live.stop()
})
test('timeout pauses until explicit restart; policy denial does not reconnect',()=>{
 let expired=false
 const h=harness({timeoutMinutes:1,onTimeout:()=>{expired=true}});h.Socket.instances[0].onopen();h.run(60000)
 assert.ok(expired);assert.equal(h.statuses.at(-1),'paused');assert.equal(h.tasks.size,0)
 const denied=harness();denied.Socket.instances[0].onclose({code:1008});assert.equal(denied.statuses.at(-1),'denied');assert.equal(denied.tasks.size,0)
})
test('reconnect is exponential, bounded, and cancellable (no HTTP polling)',()=>{
 const h=harness()
 for(let i=0;i<8;i++){h.Socket.instances.at(-1).onclose({code:1006});h.run(Math.min(30000,1000*2**i))}
 h.Socket.instances.at(-1).onclose({code:1006});assert.equal(h.statuses.at(-1),'disconnected');assert.equal(h.tasks.size,0)
 const cancelled=harness();cancelled.Socket.instances[0].onclose({code:1006});cancelled.live.stop();assert.equal(cancelled.tasks.size,0)
})
