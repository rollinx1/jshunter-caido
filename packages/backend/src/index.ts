import type { DefineAPI, SDK } from "caido:plugin";
import { Blob, Request as FetchRequest, fetch, Body } from "caido:http";
import crypto from "crypto";
import { Buffer } from "buffer";

// Configuration state
let config = {
  port: 20450,
  captureTraffic: false,
  baseUrl: "http://localhost",
  scope: "*"
};

// Dynamic API URLs based on current port
const getAPI = () => ({
  "healthcheck": `${config.baseUrl}:${config.port}/api/health`,
  "endpoints": `${config.baseUrl}:${config.port}/api/collections/endpoints/records`
});

async function callApi(sdk: SDK, url: string, options: { headers?: Record<string, string>, data?: any, method?: string }) {
  try {
    switch (options.method) {
      case "GET":
        const getRequest = new FetchRequest(url, {
          headers: options.headers,
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
    return error as Error
  }
}

async function heathCheck(sdk: SDK) {
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

async function updateConfig(sdk: SDK, newConfig: Partial<typeof config>) {
  const oldConfig = { ...config };
  config = { ...config, ...newConfig };

  sdk.console.log(`Configuration updated from ${JSON.stringify(oldConfig)} to ${JSON.stringify(config)}`);

  return config;
}

// Function to check if a host matches the scope patterns
function matchesScope(sdk: SDK, host: string, scopePatterns: string): boolean {
  if (!scopePatterns || scopePatterns.trim() === "*") {
    return true; // Match everything if scope is * or empty
  }

  try {
    // Split scope into lines and check each pattern
    const patterns = scopePatterns.split('\n').map(p => p.trim()).filter(p => p.length > 0);

    for (const pattern of patterns) {
      if (pattern === "*") {
        return true; // Wildcard matches everything
      }

      // Convert pattern to regex
      // Escape special regex characters except *
      const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      // Replace * with .*
      const regexPattern = escapedPattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`, 'i');

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

async function getConfig(sdk: SDK) {
  return config;
}

async function toggleTrafficCapture(sdk: SDK, enabled: boolean) {
  config.captureTraffic = enabled;
  sdk.console.log(`Traffic capture ${enabled ? 'enabled' : 'disabled'}`);
  return config.captureTraffic;
}

async function sendToBackend(sdk: SDK, requestId: string) {
  const requestWrapper = await sdk.requests.get(requestId);

  if (!requestWrapper) {
    throw new Error("Request not found");
  }
  const request = requestWrapper.request;
  const response = requestWrapper.response;
  if (!response) {
    throw new Error("Response not found");
  }

  const headers = request.getHeaders()
  const flatHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, value[0]])) as Record<string, string>;

  const rawBody = response.getBody()?.toRaw()
  const bodyHash = rawBody ? crypto.createHash('sha256').update(Buffer.from(rawBody)).digest('hex') : "";

  const data = {
    "url": request.getUrl(),
    "request_headers": flatHeaders,
    "body_hash": bodyHash
  }

  try {
    const API = getAPI();
    const response = await callApi(sdk, API.endpoints, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data
    })
    sdk.console.log(`Response: ${JSON.stringify(response)}`);
    return { success: true, response };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error("Error making fetch request: " + errorMessage);
    return { success: false, error: errorMessage };
  }
}

export type API = DefineAPI<{
  sendToBackend: typeof sendToBackend;
  heathCheck: typeof heathCheck;
  updateConfig: typeof updateConfig;
  getConfig: typeof getConfig;
  toggleTrafficCapture: typeof toggleTrafficCapture;
}>;

export function init(sdk: SDK<API>) {
  sdk.api.register("sendToBackend", sendToBackend)
  sdk.api.register("heathCheck", heathCheck)
  sdk.api.register("updateConfig", updateConfig)
  sdk.api.register("getConfig", getConfig)
  sdk.api.register("toggleTrafficCapture", toggleTrafficCapture)

  // Conditional traffic interception based on config
  sdk.events.onInterceptResponse(async (sdk, request, response) => {
    if (config.captureTraffic) {
      const url = request.getUrl();
      const host = request.getHost();

      // Check if host matches scope
      if (!matchesScope(sdk, host, config.scope)) {
        sdk.console.log(`Host ${host} does not match scope, skipping`);
        return;
      }

      // Only capture HTML responses
      const responseHeaders = response.getHeaders();
      const contentType = responseHeaders['content-type']?.[0] || responseHeaders['Content-Type']?.[0] || '';
      if (!contentType.toLowerCase().includes('text/html')) {
        sdk.console.log(`Skipping non-HTML response from ${url} (Content-Type: ${contentType})`);
        return;
      }
      sdk.console.log(`URL CAPTURED TRAFFIC: ${url}`);

      // Auto-send to backend when traffic capture is enabled and host matches scope
      sendToBackend(sdk, request.getId());

    }
  });
}
