import type { SDK } from "caido:plugin";
import { getGlobalConfig } from "./settings";
import { Buffer } from "buffer";
import { fetchRequest } from "./helpers";

const getAPI = (port: number) => ({
  healthcheck: `http://localhost:${port}/api/health`,
  endpoints: `http://localhost:${port}/api/collections/tmp_endpoints/records`,
});

async function sendToBackend(sdk: SDK, requestId: string, port?: number) {
  const requestWrapper = await sdk.requests.get(requestId);

  let configPort = port;
  if (!configPort) {
    const globalConfig = await getGlobalConfig(sdk);
    if (globalConfig) {
      configPort = globalConfig.port;
    }
  }
  if (!requestWrapper) {
    throw new Error("Request not found");
  }
  const request = requestWrapper.request;
  const response = requestWrapper.response;
  if (!response) {
    throw new Error("Response not found");
  }

  const headers = request.getHeaders();
  const flatHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, value[0]])
  ) as Record<string, string>;

  const rawBody = response.getBody()?.toRaw();

  // Extract query string from URL
  const fullUrl = request.getUrl();
  const urlParts = fullUrl.split("?");
  const queryString = urlParts.length > 1 ? urlParts[1] : "";

  // Prepare multipart form data
  const multipartData: Record<string, string | Buffer> = {
    url: String(urlParts[0] || ""),
    query_string: String(queryString),
    request_headers: JSON.stringify(flatHeaders),
  };

  if (!rawBody || rawBody.length === 0) {
    return;
  }
  multipartData["tmp_body"] = rawBody;

  try {
    const API = getAPI(configPort!);
    const response = await fetchRequest(API.endpoints, {
      method: "POST",
      multipartData,
    });
    sdk.console.log(`Response: ${JSON.stringify(response)}`);
    return { success: true, response };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error("Error making fetch request: " + errorMessage);
    return { success: false, error: errorMessage };
  }
}

async function healthCheck(sdk: SDK) {
  try {
    const config = await getGlobalConfig(sdk);
    if (!config) {
      throw new Error("Config not found");
    }
    const API = getAPI(config.port);
    const response = await fetchRequest(API.healthcheck, {
      method: "GET",
    });
    sdk.console.log(`Health check response: ${JSON.stringify(response)}`);
    return { success: true, response };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sdk.console.error(`Health check failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export { sendToBackend, healthCheck };
