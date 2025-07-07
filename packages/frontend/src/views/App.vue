<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputSwitch from "primevue/inputswitch";
import Textarea from "primevue/textarea";
import Toast from "primevue/toast";
import { useToast } from "primevue/usetoast";
import { useSDK } from "@/plugins/sdk";
import { ref, onMounted, computed } from "vue";

// Retrieve the SDK instance to interact with the backend
const sdk = useSDK();

// Add the toast hook to provide the API
const toast = useToast();

// Reactive state
const captureTraffic = ref(false);
const port = ref(20450);
const baseUrl = ref("http://localhost");
const scope = ref("*");
const isLoading = ref(false);
const healthStatus = ref<"unknown" | "healthy" | "error">("unknown");
const hasChanges = ref(false);

// Track changes
const originalConfig = ref({ captureTraffic: false, port: 20450, baseUrl: "http://localhost", scope: "*" });

// Load current configuration on mount
onMounted(async () => {
  await loadConfig();
});

// Watch for changes
const watchChanges = () => {
  hasChanges.value = 
    captureTraffic.value !== originalConfig.value.captureTraffic ||
    port.value !== originalConfig.value.port ||
    baseUrl.value !== originalConfig.value.baseUrl ||
    scope.value !== originalConfig.value.scope;
};

// Load configuration from backend
const loadConfig = async (showToast = false) => {
  try {
    const config = await sdk.backend.getConfig();
    captureTraffic.value = config.captureTraffic;
    port.value = config.port;
    baseUrl.value = config.baseUrl;
    scope.value = config.scope || "*";
    
    // Store original config
    originalConfig.value = { ...config, scope: config.scope || "*" };
    hasChanges.value = false;
    
    if (showToast) {
      toast.add({
        severity: "success",
        summary: "Success",
        detail: "Configuration loaded successfully",
        life: 3000
      });
    }
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Error loading configuration",
      life: 4000
    });
  }
};

// Save configuration to backend
const saveConfig = async () => {
  try {
    await sdk.backend.updateConfig({
      port: port.value,
      baseUrl: baseUrl.value,
      captureTraffic: captureTraffic.value,
      scope: scope.value
    });
    
    // Update original config
    originalConfig.value = {
      captureTraffic: captureTraffic.value,
      port: port.value,
      baseUrl: baseUrl.value,
      scope: scope.value
    };
    hasChanges.value = false;
    
    toast.add({
      severity: "success",
      summary: "Saved",
      detail: "Configuration saved successfully",
      life: 3000
    });
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Error saving configuration",
      life: 4000
    });
  }
};

// Toggle traffic capture
const toggleCapture = async () => {
  try {
    const newState = await sdk.backend.toggleTrafficCapture(captureTraffic.value);
    captureTraffic.value = newState;
    watchChanges();
    
    toast.add({
      severity: "info",
      summary: "Traffic Capture",
      detail: `Traffic capture ${newState ? 'enabled' : 'disabled'}`,
      life: 3000
    });
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Error toggling traffic capture",
      life: 4000
    });
  }
};

// Perform health check
const performHealthCheck = async () => {
  try {
    const result = await sdk.backend.heathCheck();
    if (result.success) {
      healthStatus.value = "healthy";
      toast.add({
        severity: "success",
        summary: "Connection Test",
        detail: "Backend connection successful",
        life: 3000
      });
    } else {
      healthStatus.value = "error";
      toast.add({
        severity: "error",
        summary: "Connection Failed",
        detail: `Connection error: ${result.error}`,
        life: 5000
      });
    }
  } catch (error) {
    healthStatus.value = "error";
    toast.add({
      severity: "error",
      summary: "Connection Error",
      detail: "Error checking connection",
      life: 4000
    });
  }
};

// Computed property for connection status
const connectionStatus = computed(() => {
  switch (healthStatus.value) {
    case "healthy": return { text: "Connected", color: "text-green-600" };
    case "error": return { text: "Disconnected", color: "text-red-600" };
    default: return { text: "Unknown", color: "text-gray-500" };
  }
});

// Watch for input changes
const onInputChange = () => {
  watchChanges();
};
</script>

<template>
  <div class="app-container">
    <!-- Toast Component -->
    <Toast />
    
    <!-- Left Panel - Settings (40%) -->
    <div class="settings-panel">
      <!-- Header -->
      <h2 class="text-xl font-bold mb-6 text-white">Settings</h2>
      
      <!-- Traffic Capture Setting -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <div>
            <label class="block text-sm font-medium mb-1">
              Traffic Capture
            </label>
            <p class="text-sm opacity-75">
              Enable automatic interception of requests and responses
            </p>
          </div>
          <InputSwitch 
            v-model="captureTraffic" 
            @change="toggleCapture"
          />
        </div>
      </div>

      <!-- Backend URL Setting -->
      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">
          Base URL
        </label>
        <InputText 
          v-model="baseUrl"
          placeholder="http://localhost"
          class="w-full"
          @input="onInputChange"
        />
      </div>

      <!-- Port Setting -->
      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">
          Port
        </label>
        <InputText 
          v-model="port"
          type="number"
          placeholder="20450"
          class="w-full"
          @input="onInputChange"
        />
      </div>

      <!-- Scope Configuration -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-2">
          Scope
        </label>
        <p class="text-sm opacity-75 mb-2">
          Define URL patterns to capture (one per line). Use * for wildcards.
        </p>
        <Textarea 
          v-model="scope"
          placeholder="*&#10;*.example.com&#10;https://api.target.com/*"
          class="w-full"
          rows="4"
          @input="onInputChange"
        />
      </div>

      <!-- Connection Status -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-2">
          Backend Status
        </label>
        <div class="flex items-center gap-2">
          <div :class="healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'" 
               class="w-2 h-2 rounded-full"></div>
          <span :class="connectionStatus.color" class="text-sm font-medium">
            {{ connectionStatus.text }}
          </span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3">
        <Button 
          label="Save Changes"
          @click="saveConfig"
          :disabled="!hasChanges"
        />
        
        <Button 
          label="Test Connection"
          @click="performHealthCheck"
          severity="secondary"
        />
      </div>

      <!-- Note -->
      <div class="mt-6 pt-4 border-t border-gray-700">
        <p class="text-sm opacity-75">
          <strong>Note:</strong> Changes will be applied immediately when you click "Save Changes".
          The traffic capture toggle takes effect immediately.
        </p>
      </div>
    </div>

    <!-- Right Panel - Information (60%) -->
    <div class="info-panel">
      <h2 class="text-xl font-bold mb-6 text-white">About JSHunter</h2>
      
      <div class="space-y-4">
        <p class="text-gray-300">
          <strong>JSHunter</strong> is a Caido plugin designed to capture and analyze web traffic for security testing purposes.
        </p>
        
        <p class="text-gray-300">
          This plugin automatically intercepts HTTP requests and responses when traffic capture is enabled, 
          sending the data to your configured backend for analysis and storage.
        </p>
        
        <div class="mt-6 pt-4 border-t border-gray-700">
          <h3 class="text-lg font-semibold mb-3 text-white">Features</h3>
          <ul class="space-y-2 text-gray-300">
            <li class="flex items-start gap-2">
              <span class="text-green-500 mt-1">•</span>
              <span>Automatic traffic interception</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-green-500 mt-1">•</span>
              <span>Configurable backend connection</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-green-500 mt-1">•</span>
              <span>Real-time connection status monitoring</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-green-500 mt-1">•</span>
              <span>Request/response data hashing</span>
            </li>
          </ul>
        </div>

        <div class="mt-6 pt-4 border-t border-gray-700">
          <h3 class="text-lg font-semibold mb-3 text-white">Usage</h3>
          <ol class="space-y-2 text-gray-300">
            <li class="flex items-start gap-2">
              <span class="text-blue-500 font-medium">1.</span>
              <span>Configure your backend URL and port</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-blue-500 font-medium">2.</span>
              <span>Test the connection to ensure it's working</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-blue-500 font-medium">3.</span>
              <span>Enable traffic capture to start intercepting requests</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-blue-500 font-medium">4.</span>
              <span>Save your configuration when ready</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
}

.settings-panel {
  flex: 0 0 40%;
  padding: 20px;
  overflow-y: auto;
  border-right: 1px solid var(--border-color, #374151);
}

.info-panel {
  flex: 0 0 60%;
  padding: 20px;
  overflow-y: auto;
}

.p-inputtext, .p-textarea {
  border: 1px solid var(--border-color, #4b5563);
  border-radius: 4px;
  padding: 8px 12px;
  background: var(--input-bg, #374151);
  color: var(--text-color, white);
}

.p-inputtext:focus, .p-textarea:focus {
  border-color: var(--primary-color, #3b82f6);
  box-shadow: 0 0 0 2px var(--primary-color-alpha, rgba(59, 130, 246, 0.1));
  outline: none;
}

.p-inputtext::placeholder, .p-textarea::placeholder {
  color: var(--text-color-secondary, #9ca3af);
}

.p-button {
  border-radius: 4px;
}

.p-inputswitch.p-highlight .p-inputswitch-slider {
  background: #3b82f6;
}
</style>