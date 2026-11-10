<script setup>
import { computed } from 'vue'
const props = defineProps({ value: { default: null }, color: { default: 'blue' }, label: String })
const active = computed(() => props.value === null ? 0 : Math.ceil(Math.max(0, Math.min(100, props.value)) / 5))
</script>
<template><div class="pixel-meter" role="meter" :aria-label="label" :aria-valuenow="value ?? undefined" aria-valuemin="0" aria-valuemax="100"><i v-for="i in 20" :key="i" :class="[{lit:i <= active}, color]" /></div></template>
