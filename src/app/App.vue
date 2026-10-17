<script>
import AppLayout from "../layouts/AppLayout.vue";
import UApp from "@nuxt/ui/components/App.vue";
export default { name: "App", components: { AppLayout, UApp } };
</script>

<template>
  <UApp :toaster="null" :tooltip="{ delayDuration: 350 }"><AppLayout /></UApp>
</template>
