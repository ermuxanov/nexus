<script>
import UModal from "@nuxt/ui/components/Modal.vue";
import BaseInput from "../../components/ui/BaseInput.vue";
import BaseSelect from "../../components/ui/BaseSelect.vue";
import BaseButton from "../../components/ui/BaseButton.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { preferencesStore } from "../../store/preferences.js";
import { appearanceStore } from "../../store/appearance.js";
import { validatePreferences, initials } from "../../domain/preferences.js";
import "../orders/order-dialog.scss";
import "./settings.scss";

export default {
  name: "SettingsPage",
  components: { UModal, BaseInput, BaseSelect, BaseButton, AppIcon },
  data() {
    const draft = { ...preferencesStore.state.data };
    return {
      preferences: preferencesStore.state,
      appearance: appearanceStore.state,
      draft,
      baseline: JSON.stringify(draft),
      submitted: false,
      message: "",
      appearanceMessage: "",
      discardOpen: false,
      pendingRoute: null,
      pendingReload: false,
      periods: [7, 30, 90].map((days) => ({ value: String(days), label: `Last ${days} complete days` })),
      sizes: [10, 20, 50].map((size) => ({ value: String(size), label: `${size} rows` })),
      sidebarModes: [
        { value: "expanded", label: "Expanded" },
        { value: "compact", label: "Compact" },
      ],
    };
  },
  computed: {
    dirty() {
      return JSON.stringify(this.draft) !== this.baseline;
    },
    validation() {
      return validatePreferences(this.draft);
    },
    errors() {
      return this.submitted ? this.validation.errors : {};
    },
    sidebarMode() {
      return this.appearance.collapsed ? "compact" : "expanded";
    },
  },
  watch: {
    draft: {
      deep: true,
      handler() {
        if (this.dirty) this.message = "";
      },
    },
  },
  mounted() {
    window.addEventListener("beforeunload", this.beforeUnload);
  },
  beforeUnmount() {
    window.removeEventListener("beforeunload", this.beforeUnload);
  },
  beforeRouteLeave(to) {
    if (!this.dirty) return true;
    this.pendingRoute = to.fullPath;
    this.openDiscard();
    return false;
  },
  methods: {
    initials,
    beforeUnload(event) {
      if (!this.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    },
    save() {
      this.message = "";
      this.submitted = true;
      if (!this.validation.data) {
        this.$nextTick(() => this.$refs.error?.focus());
        return;
      }
      if (preferencesStore.save(this.validation.data)) {
        this.draft = { ...this.preferences.data };
        this.baseline = JSON.stringify(this.draft);
        this.submitted = false;
        this.message = "Settings saved. Your workspace is up to date.";
        this.$nextTick(() => this.$refs.success?.focus());
      } else this.$nextTick(() => this.$refs.error?.focus());
    },
    setTheme(theme) {
      this.appearanceMessage = appearanceStore.setTheme(theme) ? "Appearance preferences saved." : "";
    },
    setSidebar(value) {
      this.appearanceMessage = appearanceStore.setCollapsed(value === "compact") ? "Sidebar preference saved." : "";
    },
    openDiscard() {
      this.discardOpen = true;
    },
    requestReload() {
      this.pendingReload = true;
      if (this.dirty) this.openDiscard();
      else this.reload();
    },
    reload() {
      this.pendingReload = false;
      if (preferencesStore.load()) {
        this.draft = { ...this.preferences.data };
        this.baseline = JSON.stringify(this.draft);
        this.submitted = false;
        this.message = "Saved settings loaded.";
        this.$nextTick(() => this.$refs.success?.focus());
      } else this.$nextTick(() => this.$refs.error?.focus());
    },
    keepEditing() {
      this.discardOpen = false;
      this.pendingRoute = null;
      this.pendingReload = false;
      this.$nextTick(() => this.$refs.form?.querySelector("input")?.focus());
    },
    discard() {
      const route = this.pendingRoute;
      this.pendingRoute = null;
      this.discardOpen = false;
      if (this.pendingReload) this.reload();
      else {
        this.draft = JSON.parse(this.baseline);
        this.submitted = false;
        this.message = "Unsaved changes discarded.";
      }
      if (route) this.$router.push(route);
      else if (!this.pendingReload)
        this.$nextTick(() => (this.preferences.error ? this.$refs.error : this.$refs.success)?.focus());
    },
  },
};
</script>

<template>
  <div class="page settings-page">
    <header class="settings-heading">
      <div>
        <h1>Settings</h1>
        <p>A workspace that feels like yours.</p>
      </div>
      <span class="settings-local-badge"><AppIcon name="shield" :size="16" />Saved in this browser</span>
    </header>
    <div class="settings-layout">
      <aside class="settings-overview" aria-label="Current workspace">
        <span class="settings-monogram" aria-hidden="true">{{ initials(preferences.data.ownerName) }}</span>
        <h2>{{ preferences.data.ownerName }}</h2>
        <p>{{ preferences.data.ownerEmail }}</p>
        <span class="settings-owner-label">Workspace owner</span>
        <div class="settings-workspace-summary">
          <span>YOUR WORKSPACE</span><strong>{{ preferences.data.workspaceName }}</strong>
          <p>One place for your orders,<br />customers and everyday work.</p>
        </div>
        <div class="settings-local-note">
          <AppIcon name="shield" :size="18" />
          <p>Your preferences stay in this browser and are available next time you visit.</p>
        </div>
      </aside>
      <div class="settings-content">
        <form id="workspace-settings" ref="form" novalidate @submit.prevent="save">
          <div
            v-if="preferences.error || (submitted && Object.keys(errors).length)"
            ref="error"
            class="settings-feedback settings-feedback--error"
            role="alert"
            tabindex="-1"
          >
            <p>{{ preferences.error || "Review the highlighted fields. Your changes have been kept." }}</p>
            <BaseButton v-if="preferences.error" @click="requestReload">Reload saved settings</BaseButton>
          </div>
          <div
            v-if="message"
            ref="success"
            class="settings-feedback settings-feedback--success"
            role="status"
            tabindex="-1"
          >
            <AppIcon name="check" :size="18" />{{ message }}
          </div>
          <section class="settings-card" aria-labelledby="settings-profile-title">
            <div class="settings-section-heading">
              <span class="settings-section-icon"><AppIcon name="customers" :size="20" /></span>
              <div>
                <h2 id="settings-profile-title">Profile</h2>
                <p>The name and initials shown across your workspace.</p>
              </div>
            </div>
            <div class="settings-fields">
              <BaseInput
                id="settings-name"
                v-model="draft.ownerName"
                label="Full name"
                autocomplete="name"
                maxlength="80"
                :error="errors.ownerName"
              /><BaseInput
                id="settings-email"
                v-model="draft.ownerEmail"
                label="Email address"
                autocomplete="email"
                type="email"
                maxlength="254"
                :error="errors.ownerEmail"
                hint="Displayed on your Settings profile."
              />
            </div>
          </section>
          <section class="settings-card" aria-labelledby="settings-workspace-title">
            <div class="settings-section-heading">
              <span class="settings-section-icon"><AppIcon name="layers" :size="20" /></span>
              <div>
                <h2 id="settings-workspace-title">Workspace</h2>
                <p>A familiar name for the place you do business.</p>
              </div>
            </div>
            <BaseInput
              id="settings-workspace"
              v-model="draft.workspaceName"
              label="Workspace name"
              maxlength="80"
              :error="errors.workspaceName"
              hint="Appears in your sidebar. All fields are required."
            />
          </section>
          <section class="settings-card" aria-labelledby="settings-defaults-title">
            <div class="settings-section-heading">
              <span class="settings-section-icon"><AppIcon name="overview" :size="20" /></span>
              <div>
                <h2 id="settings-defaults-title">View defaults</h2>
                <p>Your starting point when opening a workspace section.</p>
              </div>
            </div>
            <div class="settings-fields">
              <div>
                <BaseSelect
                  id="settings-reporting"
                  v-model="draft.reportingDays"
                  label="Overview reporting period"
                  :options="periods"
                  :aria-invalid="!!errors.reportingDays"
                  :aria-describedby="errors.reportingDays ? 'settings-reporting-error' : 'settings-reporting-hint'"
                />
                <p v-if="errors.reportingDays" id="settings-reporting-error" class="settings-field-error">
                  {{ errors.reportingDays }}
                </p>
                <p v-else id="settings-reporting-hint" class="settings-hint">Complete UTC days. Today is excluded.</p>
              </div>
              <div>
                <BaseSelect
                  id="settings-rows"
                  v-model="draft.rowsPerPage"
                  label="Rows per page"
                  :options="sizes"
                  :aria-invalid="!!errors.rowsPerPage"
                  :aria-describedby="errors.rowsPerPage ? 'settings-rows-error' : 'settings-rows-hint'"
                />
                <p v-if="errors.rowsPerPage" id="settings-rows-error" class="settings-field-error">
                  {{ errors.rowsPerPage }}
                </p>
                <p v-else id="settings-rows-hint" class="settings-hint">Applied when you open Orders or Customers.</p>
              </div>
            </div>
          </section>
          <div class="settings-save-bar">
            <p role="status">
              {{
                preferences.status === "error"
                  ? "Saved settings need attention."
                  : dirty
                    ? "You have unsaved changes."
                    : "Your settings are up to date."
              }}
            </p>
            <div>
              <BaseButton
                :disabled="!dirty"
                @click="
                  pendingReload = false;
                  openDiscard();
                "
                >Discard changes</BaseButton
              ><BaseButton type="submit" variant="primary" :disabled="!dirty || preferences.status === 'error'"
                >Save changes</BaseButton
              >
            </div>
          </div>
        </form>
        <section class="settings-card settings-appearance" aria-labelledby="settings-appearance-title">
          <div class="settings-section-heading">
            <span class="settings-section-icon"><AppIcon name="sun" :size="20" /></span>
            <div>
              <h2 id="settings-appearance-title">Appearance</h2>
              <p>Choose your look. Appearance changes save immediately.</p>
            </div>
          </div>
          <fieldset class="settings-theme-picker">
            <legend>Color theme</legend>
            <button
              type="button"
              class="settings-theme-option"
              :aria-pressed="appearance.theme === 'dark'"
              @click="setTheme('dark')"
            >
              <span class="settings-theme-preview settings-theme-preview--dark" aria-hidden="true"><i /><i /><i /></span
              ><span
                ><AppIcon name="moon" :size="16" />Dark<span
                  v-if="appearance.theme === 'dark'"
                  class="settings-selected-check"
                  ><AppIcon name="check" :size="16" /></span
              ></span></button
            ><button
              type="button"
              class="settings-theme-option"
              :aria-pressed="appearance.theme === 'light'"
              @click="setTheme('light')"
            >
              <span class="settings-theme-preview settings-theme-preview--light" aria-hidden="true"
                ><i /><i /><i /></span
              ><span
                ><AppIcon name="sun" :size="16" />Light<span
                  v-if="appearance.theme === 'light'"
                  class="settings-selected-check"
                  ><AppIcon name="check" :size="16" /></span
              ></span>
            </button>
          </fieldset>
          <div class="settings-sidebar-option">
            <div>
              <h3>Desktop sidebar</h3>
              <p>Keep labels visible or make more room for your work.</p>
            </div>
            <BaseSelect
              id="settings-sidebar"
              :model-value="sidebarMode"
              label="Sidebar layout"
              :options="sidebarModes"
              @update:model-value="setSidebar"
            />
          </div>
          <p v-if="appearance.error" class="settings-field-error" role="alert">{{ appearance.error }}</p>
          <p v-else class="settings-appearance-status" role="status">
            {{ appearanceMessage || "Your theme also follows the header control." }}
          </p>
        </section>
      </div>
    </div>
    <UModal
      :open="discardOpen"
      title="Discard unsaved changes?"
      description="Your profile, workspace and view defaults have not been saved."
      :close="false"
      :dismissible="false"
      :transition="false"
      :ui="{
        overlay: 'order-dialog-overlay',
        content: 'order-dialog settings-discard-dialog',
        header: 'order-dialog-header',
        title: 'order-dialog-title',
        description: 'order-dialog-description',
        body: 'order-dialog-body',
        footer: 'order-dialog-footer',
      }"
      @close:prevent="keepEditing"
      @update:open="!$event && keepEditing()"
    >
      <template #body
        ><p>
          Keep editing to continue with your changes, or discard them to
          {{
            pendingRoute
              ? "leave this page"
              : pendingReload
                ? "reload your saved settings"
                : "return to your saved settings"
          }}.
        </p></template
      >
      <template #footer
        ><BaseButton autofocus @click="keepEditing">Keep editing</BaseButton
        ><BaseButton variant="destructive" @click="discard">Discard changes</BaseButton></template
      >
    </UModal>
  </div>
</template>
