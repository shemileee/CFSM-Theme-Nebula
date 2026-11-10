import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBatch, apiBases, traffic, price, expires, probeValue, online, capacity, route, serverKey, percent, probeVisible } from '../src/lib/model.js'

test('CFSM capacity MB, traffic GB and direction semantics',()=>{
 assert.equal(capacity(1024),'1.00 GB')
 const s={net_rx_monthly:20,net_tx_monthly:30,traffic_limit:'100'}
 assert.equal(traffic(s).limit,100*1024**3)
 for(const [mode,result] of [['dl',20],['ul',30],['max',30],['total',50]]) assert.equal(traffic({...s,traffic_calc_type:mode}).used,result)
 assert.equal(traffic({...s,traffic_limit:0}).percent,null)
})
test('price distinguishes free and missing; calendar expiry validates dates',()=>{
 assert.equal(price({price:''}),'未设置价格')
 assert.equal(price({price:'-1'}),'免费')
 assert.equal(price({price:'0'}),'免费')
 assert.equal(price({price:'10',currency:'$',billing_cycle:'year'}),'$10/年')
 assert.equal(expires({expire_date:'2026-02-30'}),null)
 assert.equal(expires({expire_date:'2026-11-11'},new Date(2026,10,10,23)).days,1)
})
test('three-state probe values and online threshold',()=>{
 assert.equal(probeValue(false),undefined);assert.equal(probeValue(undefined),undefined)
 assert.equal(probeValue(null),null);assert.equal(probeValue(0),0)
 assert.equal(online({last_updated:1000},300999),true)
 assert.equal(online({last_updated:1000},301000),false)
 assert.equal(percent(50,0),null)
})
test('UUID routing and backend-scoped keys',()=>{
 assert.equal(route('#/server/a-b.c_123'),'a-b.c_123')
 assert.equal(route('#/server/%E0%A4%A'),null)
 assert.notEqual(serverKey('https://a.example','same'),serverKey('https://b.example','same'))
 assert.deepEqual(apiBases('https://a.example, https://b.example,https://a.example',''),['https://a.example','https://b.example'])
 for(const invalid of ['file:///tmp','https://a.example/path','https://x:y@a.example']) assert.throws(()=>apiBases(invalid,''))
})
test('incremental batch keeps missing disk/memory, supports payload/metrics, ignores stale and unknown IDs',()=>{
 const rows=[{id:'uuid',cpu:1,disk_total:4096,ram_total:1024,timestamp:100,last_updated:100,_base:'a'}]
 const result=applyBatch(rows,{type:'batchUpdate',updates:[{serverId:'unknown',samples:[{ts:1000,data:{cpu:99}}]},{serverId:'uuid',samples:[{ts:300,metrics:{cpu:30}},{ts:200,payload:{cpu:20,ping_ct:null}},{ts:50,data:{disk_total:1}},{ts:400,data:{name:'tampered',__proto__:{},cpu:40}}]}]})
 assert.equal(result[0].cpu,40);assert.equal(result[0].disk_total,4096);assert.equal(result[0].ram_total,1024);assert.equal(result[0].ping_ct,null);assert.equal(result[0].name,undefined);assert.equal(result[0].last_updated,400)
 assert.equal(rows[0].cpu,1)
})

test('empty optional nodes are hidden, disabled loss beats stale ping, numeric zero remains valid',()=>{
 assert.equal(probeVisible({ping_node_1:null,loss_node_1:null,ping:[{node_1:null}]},'node_1'),false)
 assert.equal(probeVisible({ping_node_1:80,loss_node_1:false},'node_1'),false)
 assert.equal(probeVisible({ping_node_1:80,loss:[{node_1:false}]},'node_1'),false)
 assert.equal(probeVisible({ping_node_1:80,loss_node_1:'false'},'node_1'),false)
 assert.equal(probeVisible({ping_node_1:0,loss_node_1:0},'node_1'),true)
 assert.equal(probeVisible({ping_node_1:null,loss_node_1:100},'node_1'),true)
 assert.equal(probeVisible({ping_node_1:null,ping:[{node_1:50},{node_1:null}]},'node_1'),true)
})
