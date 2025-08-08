import type { DefineAPI, SDK } from "caido:plugin";
import { getGlobalConfig, initDatabase, updateSettings } from "./settings";
import { sendToBackend, healthCheck } from "./jshunter";

export type API = DefineAPI<{
  updateSettings: typeof updateSettings;
  getGlobalConfig: typeof getGlobalConfig;
  sendToBackend: typeof sendToBackend;
  healthCheck: typeof healthCheck;
}>;

export async function init(sdk: SDK<API>) {
  await initDatabase(sdk);

  sdk.api.register("updateSettings", updateSettings);
  sdk.api.register("getGlobalConfig", getGlobalConfig);
  sdk.api.register("sendToBackend", sendToBackend);
  sdk.api.register("healthCheck", healthCheck);

  sdk.events.onInterceptResponse(async (sdk, req, resp) => {
    const config = await getGlobalConfig(sdk);
    if (config && config.trafficCapture) {
      sendToBackend(sdk, req.getId(), !!config.inScope, config.port);
    }
  });
}
