<script>
import AppIcon from "../../components/ui/AppIcon.vue";
export default { name: "NotFoundPage", components: { AppIcon } };
</script>
<template>
  <div class="not-found">
    <span class="eyebrow">404 · A SMALL DETOUR</span>
    <h1>This page isn’t in your workspace.</h1>
    <p>Head back to your overview to find your way.</p>
    <RouterLink to="/dashboard" class="button button--primary"
      >Back to overview<AppIcon name="arrow" :size="17"
    /></RouterLink>
  </div>
</template>
