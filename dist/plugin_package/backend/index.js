// packages/backend/src/index.ts
import { Blob, Request as FetchRequest, fetch } from "caido:http";
import crypto from "crypto";
import { Buffer } from "buffer";

// packages/backend/src/db.ts
var config = {
  port: 20450,
  captureTraffic: false,
  scope: {
    id: "none",
    name: "No scope selected",
    allowlist: [],
    denylist: []
  }
};
var Database = class {
  sdk;
  db = null;
  constructor(sdk) {
    this.sdk = sdk;
  }
  async init() {
    try {
      this.sdk.console.log("Database initialization started");
      this.db = await this.sdk.meta.db();
      this.sdk.console.log("Database instance created");
      await this.createTable();
      this.sdk.console.log("Database table created");
      await this.loadConfig();
      this.sdk.console.log("Config loaded");
      this.sdk.console.log("Database initialization completed successfully");
    } catch (error) {
      this.sdk.console.error(`Database initialization failed: ${error}`);
      throw error;
    }
  }
  async createTable() {
    const createConfigTableSQL = `
            CREATE TABLE IF NOT EXISTS jshunter_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                port INTEGER NOT NULL DEFAULT 20450,
                capture_traffic INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `;
    await this.db.exec(createConfigTableSQL);
  }
  async loadConfig() {
    try {
      if (!this.db) {
        this.sdk.console.log("Database not available, using default config");
        return config;
      }
      this.sdk.console.log("Loading global config from database");
      const stmt = await this.db.prepare("SELECT * FROM jshunter_config WHERE id = 1");
      const result = await stmt.get();
      if (result) {
        this.sdk.console.log(`Loaded config from database: ${JSON.stringify(result)}`);
        config.port = result.port;
        config.captureTraffic = result.capture_traffic === 1;
      } else {
        this.sdk.console.log("No config found, creating default");
        await this.saveConfig({
          port: config.port,
          captureTraffic: config.captureTraffic
        });
      }
      return config;
    } catch (error) {
      this.sdk.console.error(`Error loading config: ${error}`);
      return config;
    }
  }
  async saveConfig(newConfig) {
    try {
      this.sdk.console.log(`Saving global config: ${JSON.stringify(newConfig)}`);
      config = { ...config, ...newConfig };
      this.sdk.console.log(`Updated in-memory config: ${JSON.stringify(config)}`);
      if (!this.db) {
        this.sdk.console.log("Database not available, config only updated in memory");
        return config;
      }
      const stmt = await this.db.prepare(`
                INSERT OR REPLACE INTO jshunter_config 
                (id, port, capture_traffic, updated_at)
                VALUES (1, ?, ?, datetime('now'))
            `);
      await stmt.run(
        config.port,
        config.captureTraffic ? 1 : 0
      );
      this.sdk.console.log("Config saved to database (scope handled in memory only)");
      return config;
    } catch (error) {
      this.sdk.console.error(`Error saving config: ${error}`);
      throw error;
    }
  }
  getConfig() {
    return { ...config };
  }
};

// packages/backend/src/index.ts
var database;
var getAPI = (config2) => ({
  "healthcheck": `http://localhost:${config2.port}/api/health`,
  "endpoints": `http://localhost:${config2.port}/api/collections/tmp_endpoints/records`
});
function createMultipartFormData(fields) {
  const boundary = `----formdata-caido-${crypto.randomBytes(16).toString("hex")}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r
`));
    if (value && typeof value === "object" && "length" in value && "buffer" in value) {
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="response_body"\r
`));
      parts.push(Buffer.from("Content-Type: application/octet-stream\r\n\r\n"));
      parts.push(value);
    } else {
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r
\r
`));
      parts.push(Buffer.from(String(value)));
    }
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r
`));
  const combined = Buffer.concat(parts);
  return {
    boundary,
    body: combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength)
  };
}
async function callApi(sdk, url, options) {
  try {
    switch (options.method) {
      case "GET":
        const getRequest = new FetchRequest(url, {
          headers: options.headers
        });
        return await fetch(getRequest);
      case "POST":
        let body;
        let requestHeaders = options.headers || {};
        if (options.multipartData) {
          const { boundary, body: multipartBody } = createMultipartFormData(options.multipartData);
          body = new Blob([multipartBody], { type: `multipart/form-data; boundary=${boundary}` });
          requestHeaders["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        } else {
          body = new Blob([JSON.stringify(options.data)], { type: "application/json" });
          requestHeaders["Content-Type"] = "application/json";
        }
        const postRequest = new FetchRequest(url, {
          method: "POST",
          headers: requestHeaders,
          body
        });
        return await fetch(postRequest);
    }
  } catch (error) {
    return error;
  }
}
async function heathCheck(sdk) {
  try {
    const config2 = database.getConfig();
    const API = getAPI(config2);
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
  try {
    if (!database) {
      throw new Error("Database not initialized");
    }
    if (newConfig.scope) {
      if (typeof newConfig.scope === "string") {
        const scopeId = newConfig.scope;
        let scopeObject;
        if (scopeId === "none") {
          scopeObject = { id: "none", name: "No scope selected", allowlist: [], denylist: [] };
        } else if (scopeId === "all") {
          scopeObject = { id: "all", name: "Capture all traffic", allowlist: ["*"], denylist: [] };
        } else {
          scopeObject = { id: scopeId, name: `Scope ${scopeId}`, allowlist: [], denylist: [] };
        }
        newConfig.scope = scopeObject;
      } else {
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
async function getConfig(sdk) {
  return database.getConfig();
}
async function toggleTrafficCapture(sdk, enabled) {
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
  const config2 = database.getConfig();
  const fullUrl = request.getUrl();
  const urlParts = fullUrl.split("?");
  const queryString = urlParts.length > 1 ? urlParts[1] : "";
  const multipartData = {
    "url": String(urlParts[0] || ""),
    "query_string": String(queryString),
    "request_headers": JSON.stringify(flatHeaders)
  };
  if (rawBody && rawBody.length > 0) {
    multipartData["tmp_body"] = rawBody;
  } else {
    multipartData["tmp_body"] = Buffer.from("(empty response body)");
  }
  try {
    const API = getAPI(config2);
    const response2 = await callApi(sdk, API.endpoints, {
      method: "POST",
      multipartData
    });
    sdk.console.log(`Response: ${JSON.stringify(response2)}`);
    return { success: true, response: response2 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error("Error making fetch request: " + errorMessage);
    return { success: false, error: errorMessage };
  }
}
async function debugStatus(sdk) {
  try {
    const config2 = database.getConfig();
    sdk.console.log(`=== DEBUG STATUS ===`);
    sdk.console.log(`Database initialized: ${database ? "YES" : "NO"}`);
    sdk.console.log(`Current config: ${JSON.stringify(config2, null, 2)}`);
    sdk.console.log(`Traffic capture enabled: ${config2.captureTraffic}`);
    sdk.console.log(`Selected scope: ${config2.scope.id} (${config2.scope.name})`);
    sdk.console.log(`Scope allowlist: ${JSON.stringify(config2.scope.allowlist)}`);
    sdk.console.log(`Scope denylist: ${JSON.stringify(config2.scope.denylist)}`);
    sdk.console.log(`=== END DEBUG ===`);
    return {
      success: true,
      database_initialized: !!database,
      config: config2,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    sdk.console.error(`Debug status error: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
}
async function init(sdk) {
  try {
    database = new Database(sdk);
    await database.init();
    sdk.api.register("sendToBackend", sendToBackend);
    sdk.api.register("heathCheck", heathCheck);
    sdk.api.register("updateConfig", updateConfig);
    sdk.api.register("getConfig", getConfig);
    sdk.api.register("toggleTrafficCapture", toggleTrafficCapture);
    sdk.api.register("debugStatus", debugStatus);
    sdk.console.log(`JSHunter plugin initialized successfully`);
    const initialConfig = database.getConfig();
    sdk.console.log(`Initial config: ${JSON.stringify(initialConfig)}`);
  } catch (error) {
    sdk.console.error(`Plugin initialization failed: ${error}`);
    throw error;
  }
  sdk.events.onInterceptResponse(async (sdk2, request, response) => {
    const config2 = database.getConfig();
    sdk2.console.log(`[CONFIG] Current config: ${JSON.stringify(config2)}`);
    if (!config2.captureTraffic) {
      sdk2.console.log(`[TRAFFIC] Traffic capture is disabled - skipping`);
      return;
    }
    const host = request.getHost();
    const url = request.getUrl();
    const statusCode = response.getCode();
    const responseHeaders = response.getHeaders();
    const contentType = responseHeaders["content-type"]?.[0] || responseHeaders["Content-Type"]?.[0] || "";
    sdk2.console.log(`[FILTER] Status: ${statusCode}, Content-Type: ${contentType}`);
    if (statusCode >= 400 || !contentType.toLowerCase().includes("html")) {
      sdk2.console.log(`[FILTER] Skipping - Status >= 400 or not HTML content`);
      return;
    }
    sdk2.console.log(`[FILTER] Passed basic filtering - checking scope`);
    const scope = config2.scope;
    sdk2.console.log(`[SCOPE] Traffic interception - URL: ${url}, Host: ${host}, Scope: ${scope.id}`);
    sdk2.console.log(`[SCOPE] Scope details: ${JSON.stringify(scope)}`);
    if (scope.id === "none") {
      sdk2.console.log("[SCOPE] No scope selected - skipping capture");
      return;
    } else if (scope.id === "all") {
      sdk2.console.log("[SCOPE] Capturing all traffic - sending to backend");
      sendToBackend(sdk2, request.getId());
    } else {
      let shouldCapture = false;
      if (!scope.allowlist || scope.allowlist.length === 0) {
        shouldCapture = true;
        sdk2.console.log("[SCOPE] No allowlist restrictions - allowing");
      } else {
        shouldCapture = scope.allowlist.some((pattern) => {
          if (pattern === "*") {
            sdk2.console.log(`[SCOPE] Pattern "*" matches all - allowing`);
            return true;
          }
          const matches = url.includes(pattern) || host.includes(pattern) || url.match(new RegExp(pattern.replace(/\*/g, ".*"))) || host.match(new RegExp(pattern.replace(/\*/g, ".*")));
          sdk2.console.log(`[SCOPE] Checking allowlist pattern "${pattern}" against URL "${url}" and host "${host}": ${matches ? "MATCH" : "NO MATCH"}`);
          return matches;
        });
      }
      if (shouldCapture && scope.denylist && scope.denylist.length > 0) {
        const isBlocked = scope.denylist.some((pattern) => {
          const matches = url.includes(pattern) || host.includes(pattern) || url.match(new RegExp(pattern.replace(/\*/g, ".*"))) || host.match(new RegExp(pattern.replace(/\*/g, ".*")));
          sdk2.console.log(`[SCOPE] Checking denylist pattern "${pattern}" against URL "${url}" and host "${host}": ${matches ? "BLOCKED" : "ALLOWED"}`);
          return matches;
        });
        if (isBlocked) {
          shouldCapture = false;
          sdk2.console.log("[SCOPE] URL blocked by denylist");
        }
      }
      sdk2.console.log(`[SCOPE] Final decision for ${url}: ${shouldCapture ? "CAPTURE" : "SKIP"}`);
      if (shouldCapture) {
        sendToBackend(sdk2, request.getId());
      }
    }
  });
}
export {
  init
};
