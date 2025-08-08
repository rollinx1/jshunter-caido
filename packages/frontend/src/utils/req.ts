import type { FrontendSDK } from "../types";

function getRequestIdFromRequest(sdk: FrontendSDK, context: any) {
  if (!context.request || typeof context.request !== "object") {
    sdk.window.showToast("No request object in context", { variant: "error" });
    return;
  }
  const requestId = (context.request as { id?: string }).id;
  if (!requestId) {
    sdk.window.showToast("No request id in context", { variant: "error" });
    return null;
  }
  return requestId;
}

function getRequestsIdsFromRequestRow(sdk: FrontendSDK, context: any) {
  if (context.requests) {
    const requests = context.requests.map((request: any) => request.id);
    return requests;
  }

  return [];
}

export { getRequestIdFromRequest, getRequestsIdsFromRequestRow };
