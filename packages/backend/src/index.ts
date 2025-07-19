import type { DefineAPI, SDK } from "caido:plugin";
import { Blob, Request as FetchRequest, fetch } from "caido:http";
import crypto from "crypto";
import { Buffer } from "buffer";
import { Database, type Config } from "./db";

// Database instance
let database: Database;

// Dynamic API URLs based on current port
const getAPI = (config: Config) => ({
  "healthcheck": `http://localhost:${config.port}/api/health`,
  "endpoints": `http://localhost:${config.port}/api/collections/tmp_endpoints/records`
});

// Helper function to create multipart form data
function createMultipartFormData(fields: Record<string, string | Buffer>): { boundary: string, body: ArrayBuffer } {
  const boundary = `----formdata-caido-${crypto.randomBytes(16).toString('hex')}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\n`));

    // Check if value is a Buffer by checking if it has buffer-like properties
    if (value && typeof value === 'object' && 'length' in value && 'buffer' in value) {
      // Handle file data (Buffer)
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="response_body"\r\n`));
      parts.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
      parts.push(value as Buffer);
    } else {
      // Handle text data
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
      parts.push(Buffer.from(String(value)));
    }
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const combined = Buffer.concat(parts);

  return {
    boundary,
    body: combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength) as ArrayBuffer
  };
}

async function callApi(sdk: SDK, url: string, options: { headers?: Record<string, string>, data?: any, multipartData?: Record<string, string | Buffer>, method?: string }) {
  try {
    switch (options.method) {
      case "GET":
        const getRequest = new FetchRequest(url, {
          headers: options.headers,
        });
        return await fetch(getRequest);
      case "POST":
        let body: Blob;
        let requestHeaders = options.headers || {};

        if (options.multipartData) {
          // Create multipart form data manually
          const { boundary, body: multipartBody } = createMultipartFormData(options.multipartData);
          body = new Blob([multipartBody], { type: `multipart/form-data; boundary=${boundary}` });
          requestHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        } else {
          // For JSON data
          body = new Blob([JSON.stringify(options.data)], { type: "application/json" });
          requestHeaders['Content-Type'] = "application/json";
        }

        const postRequest = new FetchRequest(url, {
          method: "POST",
          headers: requestHeaders,
          body: body
        });

        return await fetch(postRequest);
    }
  } catch (error) {
    return error as Error
  }
}

async function heathCheck(sdk: SDK) {
  try {
    const config = database.getConfig();
    const API = getAPI(config);
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

async function updateConfig(sdk: SDK, newConfig: Partial<Config>) {
  try {
    if (!database) {
      throw new Error("Database not initialized");
    }

    // Handle scope - if it comes as a complete object, use it directly
    if (newConfig.scope) {
      if (typeof newConfig.scope === 'string') {
        const scopeId = newConfig.scope;
        let scopeObject;

        if (scopeId === "none") {
          scopeObject = { id: "none", name: "No scope selected", allowlist: [], denylist: [] };
        } else if (scopeId === "all") {
          scopeObject = { id: "all", name: "Capture all traffic", allowlist: ["*"], denylist: [] };
        } else {
          // For other scope IDs (Caido scopes) - this shouldn't happen now but keep for safety
          scopeObject = { id: scopeId, name: `Scope ${scopeId}`, allowlist: [], denylist: [] };
        }

        newConfig.scope = scopeObject;
      }
      // If it's already an object, use it as-is (ensure it has required properties)
      else {
        if (!newConfig.scope.allowlist) newConfig.scope.allowlist = [];
        if (!newConfig.scope.denylist) newConfig.scope.denylist = [];
      }
    }

    const updatedConfig = await database.saveConfig(newConfig);
    return updatedConfig;
  } catch (error) {
    sdk.console.error(`updateConfig error: ${error}`);
    throw error;
  }
}

async function getConfig(sdk: SDK) {
  return database.getConfig();
}

async function toggleTrafficCapture(sdk: SDK, enabled: boolean) {
  try {
    if (!database) {
      throw new Error("Database not initialized");
    }
    const updatedConfig = await database.saveConfig({ captureTraffic: enabled });
    return updatedConfig.captureTraffic;
  } catch (error) {
    sdk.console.error(`toggleTrafficCapture error: ${error}`);
    throw error;
  }
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

  const config = database.getConfig();

  // Extract query string from URL
  const fullUrl = request.getUrl();
  const urlParts = fullUrl.split('?');
  const queryString = urlParts.length > 1 ? urlParts[1] : "";

  // Prepare multipart form data
  const multipartData: Record<string, string | Buffer> = {
    "url": String(urlParts[0] || ""),
    "query_string": String(queryString),
    "request_headers": JSON.stringify(flatHeaders)
  };

  // Add the response body as a file if it exists
  if (rawBody && rawBody.length > 0) {
    multipartData["tmp_body"] = rawBody;
  } else {
    // Add a placeholder to ensure the field exists
    multipartData["tmp_body"] = Buffer.from("(empty response body)");
  }

  try {
    const API = getAPI(config);
    const response = await callApi(sdk, API.endpoints, {
      method: "POST",
      multipartData
    })
    sdk.console.log(`Response: ${JSON.stringify(response)}`);
    return { success: true, response };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error("Error making fetch request: " + errorMessage);
    return { success: false, error: errorMessage };
  }
}

async function debugStatus(sdk: SDK) {
  try {
    const config = database.getConfig();
    sdk.console.log(`=== DEBUG STATUS ===`);
    sdk.console.log(`Database initialized: ${database ? 'YES' : 'NO'}`);
    sdk.console.log(`Current config: ${JSON.stringify(config, null, 2)}`);
    sdk.console.log(`Traffic capture enabled: ${config.captureTraffic}`);
    sdk.console.log(`Selected scope: ${config.scope.id} (${config.scope.name})`);
    sdk.console.log(`Scope allowlist: ${JSON.stringify(config.scope.allowlist)}`);
    sdk.console.log(`Scope denylist: ${JSON.stringify(config.scope.denylist)}`);
    sdk.console.log(`=== END DEBUG ===`);

    return {
      success: true,
      database_initialized: !!database,
      config: config,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    sdk.console.error(`Debug status error: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };
  }
}

export type API = DefineAPI<{
  sendToBackend: typeof sendToBackend;
  heathCheck: typeof heathCheck;
  updateConfig: typeof updateConfig;
  getConfig: typeof getConfig;
  toggleTrafficCapture: typeof toggleTrafficCapture;
  debugStatus: typeof debugStatus;
}>;

export async function init(sdk: SDK<API>) {
  try {
    // Initialize database
    database = new Database(sdk);
    await database.init();

    // Register API functions
    sdk.api.register("sendToBackend", sendToBackend)
    sdk.api.register("heathCheck", heathCheck)
    sdk.api.register("updateConfig", updateConfig)
    sdk.api.register("getConfig", getConfig)
    sdk.api.register("toggleTrafficCapture", toggleTrafficCapture)
    sdk.api.register("debugStatus", debugStatus)

    sdk.console.log(`JSHunter plugin initialized successfully`);

    // Log initial configuration
    const initialConfig = database.getConfig();
    sdk.console.log(`Initial config: ${JSON.stringify(initialConfig)}`);
  } catch (error) {
    sdk.console.error(`Plugin initialization failed: ${error}`);
    throw error;
  }

  // Traffic interception with scope filtering
  sdk.events.onInterceptResponse(async (sdk, request, response) => {

    const config = database.getConfig();
    sdk.console.log(`[CONFIG] Current config: ${JSON.stringify(config)}`);

    if (!config.captureTraffic) {
      sdk.console.log(`[TRAFFIC] Traffic capture is disabled - skipping`);
      return;
    }


    const host = request.getHost();
    const url = request.getUrl();
    const statusCode = response.getCode();
    const responseHeaders = response.getHeaders();
    const contentType = responseHeaders['content-type']?.[0] || responseHeaders['Content-Type']?.[0] || '';

    sdk.console.log(`[FILTER] Status: ${statusCode}, Content-Type: ${contentType}`);

    // Basic filtering: only HTML responses with status < 400
    if (statusCode >= 400 || !contentType.toLowerCase().includes('html')) {
      sdk.console.log(`[FILTER] Skipping - Status >= 400 or not HTML content`);
      return;
    }

    sdk.console.log(`[FILTER] Passed basic filtering - checking scope`);

    // Scope filtering using the complete scope object
    const scope = config.scope;

    // Debug logging
    sdk.console.log(`[SCOPE] Traffic interception - URL: ${url}, Host: ${host}, Scope: ${scope.id}`);
    sdk.console.log(`[SCOPE] Scope details: ${JSON.stringify(scope)}`);

    if (scope.id === "none") {
      // No scope selected - don't capture anything
      sdk.console.log("[SCOPE] No scope selected - skipping capture");
      return;
    } else if (scope.id === "all") {
      // Capture all traffic - proceed
      sdk.console.log("[SCOPE] Capturing all traffic - sending to backend");
      sendToBackend(sdk, request.getId());
    } else {
      // Use Caido scope filtering logic
      let shouldCapture = false;

      // Check allowlist - if empty, allow all
      if (!scope.allowlist || scope.allowlist.length === 0) {
        shouldCapture = true;
        sdk.console.log("[SCOPE] No allowlist restrictions - allowing");
      } else {
        // Check if URL matches any allowlist pattern
        shouldCapture = scope.allowlist.some(pattern => {
          if (pattern === "*") {
            sdk.console.log(`[SCOPE] Pattern "*" matches all - allowing`);
            return true;
          }

          // More flexible pattern matching
          const matches = url.includes(pattern) || host.includes(pattern) ||
            url.match(new RegExp(pattern.replace(/\*/g, '.*'))) ||
            host.match(new RegExp(pattern.replace(/\*/g, '.*')));

          sdk.console.log(`[SCOPE] Checking allowlist pattern "${pattern}" against URL "${url}" and host "${host}": ${matches ? 'MATCH' : 'NO MATCH'}`);
          return matches;
        });
      }

      // Check denylist - if matches, block
      if (shouldCapture && scope.denylist && scope.denylist.length > 0) {
        const isBlocked = scope.denylist.some(pattern => {
          const matches = url.includes(pattern) || host.includes(pattern) ||
            url.match(new RegExp(pattern.replace(/\*/g, '.*'))) ||
            host.match(new RegExp(pattern.replace(/\*/g, '.*')));

          sdk.console.log(`[SCOPE] Checking denylist pattern "${pattern}" against URL "${url}" and host "${host}": ${matches ? 'BLOCKED' : 'ALLOWED'}`);
          return matches;
        });

        if (isBlocked) {
          shouldCapture = false;
          sdk.console.log("[SCOPE] URL blocked by denylist");
        }
      }

      sdk.console.log(`[SCOPE] Final decision for ${url}: ${shouldCapture ? 'CAPTURE' : 'SKIP'}`);

      if (shouldCapture) {
        sendToBackend(sdk, request.getId());
      }
    }
  });
}
