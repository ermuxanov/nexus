<script>
import AppIcon from "../../components/ui/AppIcon.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import StatePanel from "../../components/ui/StatePanel.vue";
import { workspaceStore } from "../../store/workspace.js";

const content = {
  dashboard: {
    icon: "overview",
    description: "A considered home for your numbers, your customers, and everything in between.",
    feature: "The foundation for a clearer overview.",
    detail:
      "Your workspace is ready. Revenue insights, performance metrics, and recent activity will come together here in Phase 2.",
    tags: ["Revenue insights", "Sales performance", "Recent activity"],
  },
  orders: {
    icon: "orders",
    description: "From the first purchase to the next milestone. Keep your business moving.",
    feature: "A place for every order.",
    detail:
      "The order workspace is connected. Search, filters, order details, and complete order management are planned for Phase 3.",
    tags: ["Search & filters", "Order management", "Customer relationships"],
  },
  customers: {
    icon: "customers",
    description: "Get closer to the people and teams behind your business.",
    feature: "Good business starts with people.",
    detail:
      "The customer workspace is connected. Customer profiles, related orders, and customer management are planned for Phase 4.",
    tags: ["Customer profiles", "Order history", "Contact management"],
  },
  settings: {
    icon: "settings",
    description: "Make room for the way you work, with thoughtful workspace preferences.",
    feature: "The details that make it yours.",
    detail:
      "Profile editing and workspace preferences are planned for Phase 5. You can already switch themes from the sun or moon control in the header.",
    tags: ["Profile preferences", "Appearance", "Demo data controls"],
  },
};

export default {
  name: "FoundationPage",
  components: { AppIcon, StatusBadge, StatePanel },
  data() {
    return {
      workspace: workspaceStore.state,
      areas: [
        { name: "orders", title: "Orders", icon: "orders", text: "Keep every transaction connected.", phase: "03" },
        {
          name: "customers",
          title: "Customers",
          icon: "customers",
          text: "Know the people behind the numbers.",
          phase: "04",
        },
        {
          name: "settings",
          title: "Settings",
          icon: "settings",
          text: "Create a space that feels like yours.",
          phase: "05",
        },
      ],
    };
  },
  computed: {
    content() {
      return content[this.$route.name];
    },
  },
  mounted() {
    if (this.workspace.status === "idle") this.loadWorkspace();
  },
  methods: {
    loadWorkspace() {
      return workspaceStore.load();
    },
  },
};
</script>
<template>
  <div class="page foundation-page">
    <div class="page-heading">
      <div>
        <div class="eyebrow">YOUR WORKSPACE, CONNECTED</div>
        <h1>{{ $route.meta.title }}</h1>
        <p>{{ content.description }}</p>
      </div>
      <StatusBadge tone="accent">Foundation release</StatusBadge>
    </div>
    <section class="welcome-card" aria-labelledby="welcome-title">
      <div class="welcome-card__copy">
        <span class="section-label"><span />A LITTLE CLARITY. A LOT OF POSSIBILITY.</span>
        <h2 id="welcome-title">Space to focus.<br /><span>Room to grow.</span></h2>
        <p>
          Welcome to NEXUS. Your business operations,<br class="desktop-break" />
          thoughtfully brought together in one workspace.
        </p>
        <div class="welcome-card__foot">
          <span class="check-circle"><AppIcon name="check" :size="13" /></span>Your foundation is in place<span
            class="welcome-card__line"
          /><span class="mono">01 / 06</span>
        </div>
      </div>
      <div class="orbital" aria-hidden="true">
        <div class="orbital__ring orbital__ring--one" />
        <div class="orbital__ring orbital__ring--two" />
        <div class="orbital__ring orbital__ring--three" />
        <span class="orbit-node orbit-node--one"><AppIcon name="orders" :size="22" /></span
        ><span class="orbit-node orbit-node--two"><AppIcon name="customers" :size="22" /></span
        ><span class="orbit-node orbit-node--three"><AppIcon name="overview" :size="20" /></span>
        <div class="orbital__core">N</div>
        <span class="orbital__caption">EVERYTHING, IN ORBIT.</span>
      </div>
    </section>
    <div class="section-heading">
      <h2>Built around your business</h2>
      <span>One workspace. A connected workflow.</span>
    </div>
    <div class="area-grid">
      <RouterLink v-for="area in areas" :key="area.name" :to="`/${area.name}`" class="area-card"
        ><div class="area-card__top">
          <span class="area-card__icon"><AppIcon :name="area.icon" /></span
          ><span class="phase-label">PHASE {{ area.phase }}</span>
        </div>
        <h3>{{ area.title }}<AppIcon name="arrow" :size="17" /></h3>
        <p>{{ area.text }}</p>
        <span class="area-card__link">Open workspace<AppIcon name="chevron" :size="13" /></span
      ></RouterLink>
    </div>
    <div class="foundation-grid">
      <section class="feature-panel">
        <div class="panel-heading">
          <span class="panel-icon"><AppIcon :name="content.icon" :size="18" /></span>
          <h2>{{ $route.meta.label }} workspace</h2>
          <StatusBadge>Phase {{ $route.meta.phase }}</StatusBadge>
        </div>
        <div class="feature-panel__body">
          <h3>{{ content.feature }}</h3>
          <p>{{ content.detail }}</p>
          <div class="feature-tags">
            <span v-for="tag in content.tags" :key="tag">{{ tag }}</span>
          </div>
        </div>
        <div class="panel-foot">
          <AppIcon name="clock" :size="15" /><span>Planned for the next development stages</span>
        </div>
      </section>
      <section class="data-panel" aria-labelledby="data-title">
        <div class="panel-heading">
          <span class="panel-icon"><AppIcon name="shield" :size="18" /></span>
          <h2 id="data-title">Workspace foundation</h2>
        </div>
        <StatePanel
          v-if="workspace.status === 'loading' || workspace.status === 'idle'"
          state="loading"
          title="Connecting your workspace"
          description="Preparing local demo data…"
        /><StatePanel
          v-else-if="workspace.status === 'error'"
          state="error"
          title="Data needs attention"
          :description="workspace.error"
          @retry="loadWorkspace"
        />
        <div v-else class="data-panel__body">
          <div class="data-row">
            <span><span class="connection-dot" />Demo database</span><strong>Connected</strong>
          </div>
          <div class="data-row">
            <span>Linked records</span
            ><strong
              >{{ workspace.summary.orderCount }} orders · {{ workspace.summary.customerCount }} customers</strong
            >
          </div>
          <div class="data-row"><span>Persistence</span><strong>Local storage · v1</strong></div>
          <p><AppIcon name="info" :size="15" />Sample data stays in this browser. No account needed.</p>
        </div>
      </section>
    </div>
    <div class="page-note">
      <span class="tiny-mark">N</span>
      <p>Good operations make space for great work.</p>
      <span>LET’S BUILD WHAT’S NEXT.</span>
    </div>
  </div>
</template>
