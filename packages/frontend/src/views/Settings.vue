<script setup lang="ts">
import { reactive, watch, onMounted } from "vue";
import InputText from "primevue/inputtext";
import ToggleSwitch from "primevue/toggleswitch";
import Card from "primevue/card";
import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

const config = reactive({
  id: 1,
  port: 20450,
  trafficCapture: false,
  inScope: false,
});

onMounted(async () => {
  const globalConfig = await sdk.backend.getGlobalConfig();
  if (globalConfig) {
    config.port = globalConfig.port;
    config.trafficCapture = !!globalConfig.trafficCapture;
    config.inScope = !!globalConfig.inScope;
  }
});

function validatePort() {
  const port = Number(config.port); // Ensure it's a number

  if (!Number.isInteger(port) || config.port < 1 || config.port > 65535) {
    sdk.window.showToast("Port must be between 1-65535", {
      variant: "error",
      duration: 3000,
    });
    // Optionally reset to last valid value or a default
    config.port = 20450;
  }
}

watch(
  () => ({ ...config }),
  async (newValues) => {
    if (
      !Number.isInteger(newValues.port) ||
      newValues.port < 1 ||
      newValues.port > 65535
    ) {
      return;
    }
    const newConfig = {
      id: newValues.id,
      port: Number(newValues.port),
      trafficCapture: +newValues.trafficCapture,
      inScope: +newValues.inScope,
    };
    await sdk.backend.updateSettings(newConfig);
  },
  { deep: true }
);
</script>
<template>
  <div class="flex flex-col h-full gap-1 overflow-y-auto">
    <Card
      class="h-fit"
      :pt="{
        body: { class: 'h-fit p-0' },
        content: { class: 'h-fit flex flex-col' },
      }"
    >
      <template #content>
        <div class="flex justify-between items-center p-4">
          <div>
            <h3 class="text-lg font-semibold">JSHunter Settings</h3>
            <p class="text-sm text-surface-300">
              Configure traffic capture settings
            </p>
          </div>
        </div>
      </template>
    </Card>

    <Card
      class="h-full"
      :pt="{
        body: { class: 'h-full p-0' },
        content: { class: 'h-full flex flex-col' },
      }"
    >
      <template #content>
        <div class="flex flex-col gap-6 p-4">
          <div class="flex flex-col gap-4">
            <h4 class="text-md font-medium text-surface-300">
              JSHunter Settings
            </h4>

            <div class="flex items-start justify-between gap-4">
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-sm font-medium"
                  >Enable Traffic Capture</label
                >
                <p class="text-xs text-surface-400">
                  When enabled, the plugin will automatically send HTTP traffic
                  to JSHunter Backend
                </p>
              </div>
              <div class="flex-shrink-0">
                <ToggleSwitch v-model="config.trafficCapture" />
              </div>
            </div>

            <div class="flex items-start justify-between gap-4">
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-sm font-medium">In-Scope Only</label>
                <p class="text-xs text-surface-400">
                  When enabled, the plugin will only analyze requests that are
                  in scope
                </p>
              </div>
              <div class="flex-shrink-0">
                <ToggleSwitch v-model="config.inScope" />
              </div>
            </div>

            <div class="flex items-start justify-between gap-4">
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-sm font-medium">Port</label>
                <p class="text-xs text-surface-400">Port to send requests to</p>
              </div>
              <div class="flex-shrink-0">
                <InputText
                  v-model="config.port"
                  type="number"
                  placeholder="20450"
                  class="w-full"
                  @blur="validatePort"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>
