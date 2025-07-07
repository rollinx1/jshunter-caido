// packages/backend/src/index.ts
import { Blob, Request as FetchRequest, fetch } from "caido:http";
import crypto from "crypto";
import { Buffer } from "buffer";
var config = {
  port: 20450,
  captureTraffic: false,
  baseUrl: "http://localhost",
  scope: "*"
};
var getAPI = () => ({
  "healthcheck": `${config.baseUrl}:${config.port}/api/health`,
  "endpoints": `${config.baseUrl}:${config.port}/api/collections/endpoints/records`
});
async function callApi(sdk, url, options) {
  try {
    switch (options.method) {
      case "GET":
        const getRequest = new FetchRequest(url, {
          headers: options.headers
        });
        return await fetch(getRequest);
      case "POST":
        const postRequest = new FetchRequest(url, {
          method: "POST",
          headers: options.headers,
          body: new Blob([JSON.stringify(options.data)], { type: "application/json" })
        });
        return await fetch(postRequest);
    }
  } catch (error) {
    return error;
  }
}
async function heathCheck(sdk) {
  try {
    const API = getAPI();
    const response = await callApi(sdk, API.healthcheck, {
      method: "GET"
    });
    sdk.console.log(`Health check response: ${JSON.stringify(response)}`);
    return { success: true, response };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error(`Health check failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}
async function updateConfig(sdk, newConfig) {
  const oldConfig = { ...config };
  config = { ...config, ...newConfig };
  sdk.console.log(`Configuration updated from ${JSON.stringify(oldConfig)} to ${JSON.stringify(config)}`);
  return config;
}
function matchesScope(sdk, host, scopePatterns) {
  if (!scopePatterns || scopePatterns.trim() === "*") {
    return true;
  }
  try {
    const patterns = scopePatterns.split("\n").map((p) => p.trim()).filter((p) => p.length > 0);
    for (const pattern of patterns) {
      if (pattern === "*") {
        return true;
      }
      const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      const regexPattern = escapedPattern.replace(/\*/g, ".*");
      const regex = new RegExp(`^${regexPattern}$`, "i");
      if (regex.test(host)) {
        return true;
      }
    }
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error(`Error matching host ${host}: ${errorMessage}`);
    return false;
  }
}
async function getConfig(sdk) {
  return config;
}
async function toggleTrafficCapture(sdk, enabled) {
  config.captureTraffic = enabled;
  sdk.console.log(`Traffic capture ${enabled ? "enabled" : "disabled"}`);
  return config.captureTraffic;
}
async function sendToBackend(sdk, requestId) {
  const requestWrapper = await sdk.requests.get(requestId);
  if (!requestWrapper) {
    throw new Error("Request not found");
  }
  const request = requestWrapper.request;
  const response = requestWrapper.response;
  if (!response) {
    throw new Error("Response not found");
  }
  const headers = request.getHeaders();
  const flatHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, value[0]]));
  const rawBody = response.getBody()?.toRaw();
  const bodyHash = rawBody ? crypto.createHash("sha256").update(Buffer.from(rawBody)).digest("hex") : "";
  const data = {
    "url": request.getUrl(),
    "request_headers": flatHeaders,
    "body_hash": bodyHash
  };
  try {
    const API = getAPI();
    const response2 = await callApi(sdk, API.endpoints, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      data
    });
    sdk.console.log(`Response: ${JSON.stringify(response2)}`);
    return { success: true, response: response2 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error("Error making fetch request: " + errorMessage);
    return { success: false, error: errorMessage };
  }
}
function init(sdk) {
  sdk.api.register("sendToBackend", sendToBackend);
  sdk.api.register("heathCheck", heathCheck);
  sdk.api.register("updateConfig", updateConfig);
  sdk.api.register("getConfig", getConfig);
  sdk.api.register("toggleTrafficCapture", toggleTrafficCapture);
  sdk.events.onInterceptResponse(async (sdk2, request, response) => {
    if (config.captureTraffic) {
      const url = request.getUrl();
      const host = request.getHost();
      if (!matchesScope(sdk2, host, config.scope)) {
        sdk2.console.log(`Host ${host} does not match scope, skipping`);
        return;
      }
      const responseHeaders = response.getHeaders();
      const contentType = responseHeaders["content-type"]?.[0] || responseHeaders["Content-Type"]?.[0] || "";
      if (!contentType.toLowerCase().includes("text/html")) {
        sdk2.console.log(`Skipping non-HTML response from ${url} (Content-Type: ${contentType})`);
        return;
      }
      sdk2.console.log(`URL CAPTURED TRAFFIC: ${url}`);
      sendToBackend(sdk2, request.getId());
    }
  });
}
export {
  init
};
