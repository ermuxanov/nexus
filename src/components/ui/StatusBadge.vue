<script>
export default { name: "StatusBadge", props: { tone: { type: String, default: "neutral" } } };
</script>
<template>
  <span class="badge" :class="`badge--${tone}`"><span class="badge__dot" /><slot /></span>
</template>
