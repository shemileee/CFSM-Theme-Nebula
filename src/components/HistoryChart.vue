<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)
const props = defineProps({ rows: Array, series: Array, title: String, unit: { default: '' }, dark: Boolean, smooth: Boolean, connectGaps: Boolean })
const canvas = ref(null)
let chart
function render() {
  if (!canvas.value) return
  chart?.destroy()
  const color = props.dark ? '#94a3b8' : '#64748b'
  chart = new Chart(canvas.value, {type:'line', data:{ datasets: props.series.map(s => ({ label:s.label, data:props.rows.map(r=>({x:Number(r.timestamp),y:s.read(r)})), borderColor:s.color, backgroundColor:s.color + '20', borderWidth:2, pointRadius:0, pointHitRadius:8, spanGaps:props.connectGaps, tension:props.smooth ? 0.35 : 0 })) }, options:{ responsive:true, maintainAspectRatio:false, animation:false, parsing:false, normalized:true, interaction:{mode:'nearest',intersect:false}, plugins:{legend:{labels:{color,usePointStyle:true,boxWidth:7}},tooltip:{callbacks:{title:items=>new Date(items[0]?.parsed.x).toLocaleString(),label:item=>item.dataset.label + ': ' + (item.parsed.y ?? '—') + ' ' + props.unit}}}, scales:{x:{type:'linear',ticks:{color,maxTicksLimit:5,callback:v=>new Date(v).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})},grid:{display:false}},y:{beginAtZero:true,ticks:{color},grid:{color:props.dark ? '#2d3245' : '#edf0f5'}}}} })
}
onMounted(render)
watch(()=>[props.rows,props.series,props.dark,props.smooth,props.connectGaps],render)
onBeforeUnmount(()=>chart?.destroy())
</script>
<template><section class="chart-panel"><h3>{{ title }}</h3><div class="chart-canvas"><canvas ref="canvas" role="img" :aria-label="title" /></div></section></template>
