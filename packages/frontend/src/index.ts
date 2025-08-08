import { Classic } from "@caido/primevue";
import PrimeVue from "primevue/config";
import { createApp } from "vue";

import { SDKPlugin } from "./plugins/sdk";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import App from "./views/App.vue";
import { getRequestsIdsFromRequestRow } from "./utils/req";
import { isRequestRowContext } from "./utils/ctx";

// This is the entry point for the frontend plugin
export const init = (sdk: FrontendSDK) => {
  const app = createApp(App);

  // Load the PrimeVue component library
  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });

  // Provide the FrontendSDK
  app.use(SDKPlugin, sdk);

  // Create the root element for the app
  const root = document.createElement("div");
  Object.assign(root.style, {
    height: "100%",
    width: "100%",
  });

  // Set the ID of the root element
  // Replace this with the value of the prefixWrap plugin in caido.config.ts
  // This is necessary to prevent styling conflicts between plugins
  root.id = `plugin--jshunter`;

  // Mount the app to the root element
  app.mount(root);

  // Add the page to the navigation
  // Make sure to use a unique name for the page
  sdk.navigation.addPage("/jshunter", {
    body: root,
  });

  // Add a sidebar item
  sdk.sidebar.registerItem("JS Hunter", "/jshunter", {
    icon: "fa-brands fa-square-js",
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: `send-row-to-backend`,
    leadingIcon: "fas fa-exchange-alt",
  });

  sdk.commands.register(`send-row-to-backend`, {
    name: "Send to Backend",
    run: async (context: any) => {
      if (!isRequestRowContext(sdk, context)) {
        sdk.window.showToast("Invalid context provided", { variant: "error" });
        return;
      }
      const healthCheck = await sdk.backend.healthCheck();
      if (!healthCheck) {
        sdk.window.showToast(
          "Server is not running, please check the server state",
          { variant: "error" }
        );
        return;
      }
      sdk.window.showToast("Sending request to backend", { variant: "info" });

      const requestsId = getRequestsIdsFromRequestRow(sdk, context);
      for (const requestId of requestsId) {
        try {
          await sdk.backend.sendToBackend(requestId);
        } catch (error) {
          sdk.window.showToast(`Error sending request to backend: ${error}`, {
            variant: "error",
          });
        }
      }
    },
  });
};
