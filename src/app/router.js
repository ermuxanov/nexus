import { createRouter, createWebHashHistory } from "vue-router";
import NotFoundPage from "../features/foundation/NotFoundPage.vue";
import DashboardPage from "../features/dashboard/DashboardPage.vue";
const OrdersPage = () => import("../features/orders/OrdersPage.vue");
const CustomersPage = () => import("../features/customers/CustomersPage.vue");
const SettingsPage = () => import("../features/settings/SettingsPage.vue");

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    ...[
      ["dashboard", "Overview", "Your business, in focus", 2],
      ["orders", "Orders", "Every order. One clear view.", 3],
      ["customers", "Customers", "Relationships that move you forward", 4],
      ["settings", "Settings", "A workspace that works for you", 5],
    ].map(([path, label, title, phase]) => ({
      path: `/${path}`,
      name: path,
      component:
        path === "dashboard"
          ? DashboardPage
          : path === "orders"
            ? OrdersPage
            : path === "customers"
              ? CustomersPage
              : SettingsPage,
      meta: { label, title, phase },
    })),
    { path: "/:pathMatch(.*)*", component: NotFoundPage, meta: { label: "Page not found" } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
router.afterEach((to, from, failure) => {
  if (!failure) document.title = `${to.meta.label} · NEXUS`;
});
export default router;
