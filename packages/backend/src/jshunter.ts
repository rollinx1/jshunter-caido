import type { SDK } from "caido:plugin";
import { getGlobalConfig } from "./settings";
import { Buffer } from "buffer";
import { fetchRequest } from "./helpers";

const getAPI = (port: number) => ({
  healthcheck: `http://localhost:${port}/api/health`,
  endpoints: `http://localhost:${port}/api/collections/tmp_endpoints/records`,
});

async function sendToBackend(
  sdk: SDK,
  requestId: string,
  inScope?: boolean,
  port?: number
) {
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
    if (
      rawBody === undefined ||
      rawBody.length === 0 ||
      response.getCode() !== 200 ||
      contentType === undefined ||
      !contentType[0]?.includes("html")
    ) {
      throw new Error("Request does not fit the requirements to be processed");
    }
    const headers = request.getHeaders();
    const flatHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, value[0]])
    ) as Record<string, string>;
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

    multipartData["tmp_body"] = rawBody;
    const API = getAPI(configPort!);
    await fetchRequest(API.endpoints, {
      method: "POST",
      multipartData,
    });
    return { success: true };
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
