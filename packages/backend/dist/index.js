// packages/backend/src/settings.ts
async function getGlobalConfig(sdk) {
  try {
    const db = await sdk.meta.db();
    const select = await db.prepare("SELECT * FROM global_config WHERE id=1");
    const config = await select.get();
    if (config) {
      return {
        id: config.id,
        inScope: config.in_scope,
        port: config.port,
        trafficCapture: config.traffic_capture
      };
    }
    return void 0;
  } catch (err) {
    throw new Error(JSON.stringify(err));
  }
}
async function initDatabase(sdk) {
  const db = await sdk.meta.db();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS global_config (
      id INTEGER PRIMARY KEY,
      port INTEGER DEFAULT 20450,
      traffic_capture INTEGER DEFAULT 0,
      in_scope INTEGER DEFAULT 1 
    )
  `);
  const globalConfig = await getGlobalConfig(sdk);
  if (!globalConfig) {
    const stmt = await db.prepare(
      `INSERT INTO global_config 
      (id, port, traffic_capture, in_scope) 
      VALUES (1, 20450, 0, 1)`
    );
    await stmt.run();
  }
}
async function updateRow(sdk, attr, value) {
  const db = await sdk.meta.db();
  const statement = await db.prepare(
    `UPDATE global_config set ${attr} = (?) WHERE id = 1`
  );
  await statement.run(value);
}
async function updateSettings(sdk, config) {
  await updateRow(sdk, "in_scope", config.inScope);
  await updateRow(sdk, "traffic_capture", config.trafficCapture);
  await updateRow(sdk, "port", config.port);
}

// packages/backend/src/helpers.ts
import crypto from "crypto";
import { Buffer } from "buffer";
import { Blob, Request as FetchRequest, fetch } from "caido:http";
function createMultipartFormData(fields) {
  const boundary = `----formdata-caido-${crypto.randomBytes(16).toString("hex")}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r
`));
    if (value && typeof value === "object" && "length" in value && "buffer" in value) {
      parts.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${name}"; filename="response_body"\r
`
        )
      );
      parts.push(Buffer.from("Content-Type: application/octet-stream\r\n\r\n"));
      parts.push(value);
    } else {
      parts.push(
        Buffer.from(`Content-Disposition: form-data; name="${name}"\r
\r
`)
      );
      parts.push(Buffer.from(String(value)));
    }
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r
`));
  const combined = Buffer.concat(parts);
  return {
    boundary,
    body: combined.buffer.slice(
      combined.byteOffset,
      combined.byteOffset + combined.byteLength
    )
  };
}
async function fetchRequest(url, options) {
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
          const { boundary, body: multipartBody } = createMultipartFormData(
            options.multipartData
          );
          body = new Blob([multipartBody], {
            type: `multipart/form-data; boundary=${boundary}`
          });
          requestHeaders["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        } else {
          body = new Blob([JSON.stringify(options.data)], {
            type: "application/json"
          });
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

// packages/backend/src/jshunter.ts
var getAPI = (port) => ({
  healthcheck: `http://localhost:${port}/api/health`,
  endpoints: `http://localhost:${port}/api/collections/tmp_endpoints/records`
});
async function sendToBackend(sdk, requestId, inScope, port) {
  try {
    let configPort = port;
    let isInScope = inScope;
    if (!configPort || !isInScope) {
      const globalConfig = await getGlobalConfig(sdk);
      if (globalConfig) {
        configPort = globalConfig.port;
        isInScope = !!globalConfig.inScope;
      }
    }
    const requestWrapper = await sdk.requests.get(requestId);
    if (!requestWrapper) {
      throw new Error("Request not found");
    }
    const request = requestWrapper.request;
    const response = requestWrapper.response;
    if (!response) {
      throw new Error("Response not found");
    }
    if (isInScope && !sdk.requests.inScope(request)) {
      throw new Error("Request not in scope");
    }
    const rawBody = response.getBody()?.toRaw();
    const contentType = response.getHeader("Content-Type");
    sdk.console.log(contentType);
    if (rawBody === void 0 || rawBody.length === 0 || response.getCode() !== 200 || contentType === void 0 || !contentType[0]?.includes("html")) {
      sdk.console.log("WTF");
      throw new Error("Request does not fit the requirements to be processed");
    }
    const headers = request.getHeaders();
    const flatHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, value[0]])
    );
    const fullUrl = request.getUrl();
    const urlParts = fullUrl.split("?");
    const queryString = urlParts.length > 1 ? urlParts[1] : "";
    const multipartData = {
      url: String(urlParts[0] || ""),
      query_string: String(queryString),
      request_headers: JSON.stringify(flatHeaders)
    };
    multipartData["tmp_body"] = rawBody;
    const API = getAPI(configPort);
    await fetchRequest(API.endpoints, {
      method: "POST",
      multipartData
    });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error("Error making fetch request: " + errorMessage);
    return { success: false, error: errorMessage };
  }
}
async function healthCheck(sdk) {
  try {
    const config = await getGlobalConfig(sdk);
    if (!config) {
      throw new Error("Config not found");
    }
    const API = getAPI(config.port);
    const response = await fetchRequest(API.healthcheck, {
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

// packages/backend/src/index.ts
async function init(sdk) {
  await initDatabase(sdk);
  sdk.api.register("updateSettings", updateSettings);
  sdk.api.register("getGlobalConfig", getGlobalConfig);
  sdk.api.register("sendToBackend", sendToBackend);
  sdk.api.register("healthCheck", healthCheck);
  sdk.events.onInterceptResponse(async (sdk2, req, resp) => {
    const config = await getGlobalConfig(sdk2);
    if (config && config.trafficCapture) {
      sendToBackend(sdk2, req.getId(), !!config.inScope, config.port);
    }
  });
}
export {
  init
};
