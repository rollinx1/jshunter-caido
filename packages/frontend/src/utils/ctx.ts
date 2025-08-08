import { FrontendSDK } from "../types";

function isRequestContext(sdk: FrontendSDK, ctx: any) {
  if (!ctx) {
    sdk.window.showToast("No context provided", { variant: "error" });
    return;
  }

  if (typeof ctx !== "object") {
    sdk.window.showToast("Invalid context type", { variant: "error" });
    return;
  }
  return ctx.type === "RequestContext";
}

function isRequestRowContext(sdk: FrontendSDK, ctx: any) {
  if (!ctx) {
    sdk.window.showToast("No context provided", { variant: "error" });
    return;
  }

  if (typeof ctx !== "object") {
    sdk.window.showToast("Invalid context type", { variant: "error" });
    return;
  }
  return ctx.type === "RequestRowContext";
}

export { isRequestContext, isRequestRowContext };
