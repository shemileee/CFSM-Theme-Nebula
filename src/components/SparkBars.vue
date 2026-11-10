<script setup>
defineProps({ values: { default: () => [] }, color: { default: 'blue' } })
</script>
<template><div class="spark" aria-hidden="true"><i v-for="(v,i) in values" :key="i" :class="color" :style="{height: Math.max(10, Number(v) / Math.max(...values, 1) * 100) + '%'}" /></div></template>
