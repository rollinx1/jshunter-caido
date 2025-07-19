import { Classic } from "@caido/primevue";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import { createApp } from "vue";
import { isRequestContext, isRequestRowContext } from "./utils/ctx";
import { getRequestIdFromRequest, getRequestsIdsFromRequestRow } from "./utils/req";

import App from "./views/App.vue";

import "./styles/index.css";

import { SDKPlugin } from "./plugins/sdk";
import type { FrontendSDK } from "./types";


// This is the entry point for the frontend plugin
export const init = (sdk: FrontendSDK) => {
  const app = createApp(App);
  
  // Load the PrimeVue component library
  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });

  // Register ToastService globally
  app.use(ToastService);

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
  root.id = `plugin--frontend-vue`;

  // Mount the app to the root element
  app.mount(root);

  // Add the page to the navigation
  // Make sure to use a unique name for the page
  sdk.navigation.addPage("/jshunter", {
    body: root,
  });

  sdk.sidebar.registerItem("JSHunter", "/jshunter");


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
      const healthCheck = await sdk.backend.heathCheck()
      if (!healthCheck) {
        sdk.window.showToast("Server is not running, please check the server state", { variant: "error" });
        return;
      }
      sdk.window.showToast("Sending request to backend", { variant: "info" });

      const requestsId = getRequestsIdsFromRequestRow(sdk, context);
      for (const requestId of requestsId) {

        try {
          await sdk.backend.sendToBackend(requestId)
        } catch (error) {
          sdk.window.showToast(`Error sending request to backend: ${error}`, { variant: "error" });
        }
      }



    }
  });

  sdk.menu.registerItem({
    type: "Request",
    commandId: `send-request-to-backend`,
    leadingIcon: "fas fa-exchange-alt",
  });
  sdk.commands.register(`send-request-to-backend`, {
    name: "Send Request to Backend",
    run: async (context: any) => {
      if (!isRequestContext(sdk, context)) {
        sdk.window.showToast("Invalid context provided", { variant: "error" });
        return;
      }

      const requestId = getRequestIdFromRequest(sdk, context);
      if (!requestId) {
        sdk.window.showToast("No request id in context", { variant: "error" });
        return;
      }


      try {
        sdk.window.showToast("Sending request to backend", { variant: "info" });

        await sdk.backend.sendToBackend(requestId)
      } catch (error) {
        sdk.window.showToast(`Error sending request to backend: ${error}`, { variant: "error" });
      }

    }
  });
};
