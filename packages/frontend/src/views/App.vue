<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputSwitch from "primevue/inputswitch";
import Dropdown from "primevue/dropdown";
import Toast from "primevue/toast";
import { useToast } from "primevue/usetoast";
import { useSDK } from "@/plugins/sdk";
import { ref, onMounted } from "vue";

// Define interfaces for type safety
interface ScopeConfig {
  id: string;
  name: string;
  allowlist: string[];
  denylist: string[];
}

interface AppConfig {
  captureTraffic: boolean;
  port: number;
  selectedScope: ScopeConfig | null;
}

// Retrieve the SDK instance to interact with the backend
const sdk = useSDK();

// Add the toast hook to provide the API
const toast = useToast();

// Reactive state
const captureTraffic = ref(false);
const port = ref(20450);
const selectedScope = ref<ScopeConfig | null>(null);
const availableScopes = ref<ScopeConfig[]>([]);
const hasChanges = ref(false);

// Track changes
const originalConfig = ref<AppConfig>({ captureTraffic: false, port: 20450, selectedScope: null });

// Load current configuration on mount
onMounted(async () => {
  await loadScopes();
  await loadConfig();
});

// Watch for changes (excluding traffic capture since it's applied immediately)
const watchChanges = () => {
  hasChanges.value = 
    port.value !== originalConfig.value.port ||
    selectedScope.value?.id !== originalConfig.value.selectedScope?.id;
};

// Load available scopes from Caido
const loadScopes = async () => {
  try {
    // Get global Caido scopes
    const caidoScopes = sdk.scopes.getScopes();
    
    // Add default "No scope selected" option at the beginning
    const defaultScope = {
      id: "none",
      name: "No scope selected",
      allowlist: [],
      denylist: []
    };
    
    // Add "Capture all traffic" option as second option
    const captureAllScope = {
      id: "all",
      name: "Capture all traffic",
      allowlist: ["*"],
      denylist: []
    };
    
    // Combine: defaults + Caido global scopes
    availableScopes.value = [
      defaultScope, 
      captureAllScope,
      ...caidoScopes
    ];
    
    console.log("Loaded scopes:", availableScopes.value.map(s => ({ id: s.id, name: s.name })));
    
    // Always default to "No scope selected"
    selectedScope.value = defaultScope;
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Error loading scopes",
      life: 4000
    });
  }
};

// Load configuration from backend
const loadConfig = async () => {
  try {
    const config = await sdk.backend.getConfig();
    console.log("Loaded config from backend:", config);
    
    captureTraffic.value = config.captureTraffic;
    port.value = config.port;
    
    // Handle the scope object from backend
    if (config.scope) {
      // Backend sends complete scope object
      if (config.scope.id === "none") {
        selectedScope.value = {
          id: "none",
          name: "No scope selected",
          allowlist: [],
          denylist: []
        };
      } else if (config.scope.id === "all") {
        selectedScope.value = {
          id: "all",
          name: "Capture all traffic",
          allowlist: ["*"],
          denylist: []
        };
      } else {
        // Try to find the scope in available Caido scopes
        const foundScope = availableScopes.value.find(s => s.id === config.scope.id);
        if (foundScope) {
          selectedScope.value = foundScope;
        } else {
          // Use the scope from backend (might be from a previous session)
          selectedScope.value = config.scope;
        }
      }
    } else {
      // Default to "No scope selected" if no scope info
      selectedScope.value = {
        id: "none",
        name: "No scope selected",
        allowlist: [],
        denylist: []
      };
    }
    
    // Update original config for change detection
    originalConfig.value = {
      captureTraffic: config.captureTraffic,
      port: config.port,
      selectedScope: selectedScope.value
    };
    hasChanges.value = false;
  } catch (error) {
    console.error("Error loading config:", error);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Error loading configuration",
      life: 4000
    });
  }
};

// Save configuration to backend (excluding traffic capture which is handled separately)
const saveConfig = async () => {
  try {
    // Send the complete scope object to backend
    await sdk.backend.updateConfig({
      port: port.value,
      scope: selectedScope.value || undefined // Send the complete scope object
    });
    
    // Update original config (keep current traffic capture state)
    originalConfig.value = {
      captureTraffic: captureTraffic.value,
      port: port.value,
      selectedScope: selectedScope.value
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

// Toggle traffic capture (applies immediately)
const toggleCapture = async () => {
  try {
    const newState = await sdk.backend.toggleTrafficCapture(captureTraffic.value);
    captureTraffic.value = newState;
    
    // Update the original config to reflect the immediate change
    originalConfig.value.captureTraffic = newState;
    
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

// Watch for input changes
const onInputChange = () => {
  watchChanges();
};

// Handle scope selection changes
const onScopeChange = async () => {
  console.log("Scope changed to:", selectedScope.value);
  
  try {
    // Save scope change immediately to backend
    await sdk.backend.updateConfig({
      scope: selectedScope.value || undefined
    });
    
    // Update original config to reflect the immediate change
    originalConfig.value.selectedScope = selectedScope.value;
    
    toast.add({
      severity: "success",
      summary: "Scope Updated",
      detail: `Scope changed to: ${selectedScope.value?.name || 'Unknown'}`,
      life: 3000
    });
    
    // Show warning if "No scope selected" is chosen while traffic capture is enabled
    if (selectedScope.value?.id === "none" && captureTraffic.value) {
      toast.add({
        severity: "warn",
        summary: "Warning",
        detail: "No scope selected - traffic capture will not work until you select a scope",
        life: 5000
      });
    }
  } catch (error) {
    console.error("Error updating scope:", error);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to update scope",
      life: 4000
    });
  }
};


</script>

<template>
  <div class="app-container">
    <!-- Toast Component -->
    <Toast />
    
    <!-- Settings Panel -->
    <div class="settings-panel">
      <!-- Header -->
      <h2 class="text-xl font-bold mb-6 text-white">JSHunter Settings</h2>
      
      <!-- Traffic Capture Setting -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <div>
            <label class="block text-sm font-medium mb-1">
              Traffic Capture
            </label>
            <p class="text-sm opacity-75">
              Enable automatic interception of responses
            </p>
            <!-- Warning when no scope is selected -->
            <div v-if="!selectedScope || selectedScope.id === 'none'" class="text-yellow-500 mt-1 text-sm">
              ⚠️ No scope selected - traffic capture will not work
            </div>
          </div>
          <InputSwitch 
            v-model="captureTraffic" 
            @change="toggleCapture"
          />
        </div>
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

      <!-- Scope Selection -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-2">
          Scope
        </label>
        <p class="text-sm opacity-75 mb-2">
          Select a scope from your Caido configuration to define which URLs to capture.
        </p>
        <Dropdown 
          v-model="selectedScope"
          :options="availableScopes"
          optionLabel="name"
          placeholder="Select a scope"
          class="w-full"
          @change="onScopeChange"
        >
          <template #option="slotProps">
            <div class="flex flex-col">
              <span class="font-medium">{{ slotProps.option.name }}</span>
              <span v-if="slotProps.option.id === 'none'" class="text-sm opacity-75">
                No filtering - traffic capture will not work
              </span>
              <span v-else-if="slotProps.option.id === 'all'" class="text-sm opacity-75">
                Capture all traffic (no filtering)
              </span>
              <span v-else class="text-sm opacity-75">
                {{ slotProps.option.allowlist?.length || 0 }} allowed, {{ slotProps.option.denylist?.length || 0 }} denied
              </span>
            </div>
          </template>
          <template #value="slotProps">
            <div v-if="slotProps.value" class="flex flex-col">
              <span class="font-medium">{{ slotProps.value.name }}</span>
              <span v-if="slotProps.value.id === 'none'" class="text-sm opacity-75">
                No filtering - traffic capture will not work
              </span>
              <span v-else-if="slotProps.value.id === 'all'" class="text-sm opacity-75">
                Capture all traffic (no filtering)
              </span>
              <span v-else class="text-sm opacity-75">
                {{ slotProps.value.allowlist?.length || 0 }} allowed, {{ slotProps.value.denylist?.length || 0 }} denied
              </span>
            </div>
            <span v-else>Select a scope</span>
          </template>
        </Dropdown>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3">
        <Button 
          label="Save Changes"
          @click="saveConfig"
          :disabled="!hasChanges"
        />
      </div>

      <!-- Note -->
      <div class="mt-6 pt-4 border-t border-gray-700">
        <p class="text-sm opacity-75">
          <strong>Note:</strong> URL and port changes require clicking "Save Changes" to apply.
          Traffic capture toggle and scope selection take effect immediately.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  padding: 20px;
}

.settings-panel {
  flex: 1;
  max-width: 600px;
}

.p-inputtext, .p-dropdown {
  border: 1px solid var(--border-color, #4b5563);
  border-radius: 4px;
  padding: 8px 12px;
  background: var(--input-bg, #374151);
  color: var(--text-color, white);
}

.p-inputtext:focus, .p-dropdown:focus-within {
  border-color: var(--primary-color, #3b82f6);
  box-shadow: 0 0 0 2px var(--primary-color-alpha, rgba(59, 130, 246, 0.1));
  outline: none;
}

.p-inputtext::placeholder {
  color: var(--text-color-secondary, #9ca3af);
}

.p-dropdown-panel {
  background: var(--surface-card, #374151);
  border: 1px solid var(--border-color, #4b5563);
}

.p-dropdown-item {
  color: var(--text-color, white);
}

.p-dropdown-item:hover {
  background: var(--surface-hover, #4b5563);
}

.p-button {
  border-radius: 4px;
}

.p-inputswitch.p-highlight .p-inputswitch-slider {
  background: #3b82f6;
}
</style>