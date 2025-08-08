import crypto from "crypto";
import { Buffer } from "buffer";
import { Blob, Request as FetchRequest, fetch } from "caido:http";

function createMultipartFormData(fields: Record<string, string | Buffer>): {
  boundary: string;
  body: ArrayBuffer;
} {
  const boundary = `----formdata-caido-${crypto
    .randomBytes(16)
    .toString("hex")}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\n`));

    // Check if value is a Buffer by checking if it has buffer-like properties
    if (
      value &&
      typeof value === "object" &&
      "length" in value &&
      "buffer" in value
    ) {
      // Handle file data (Buffer)
      parts.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${name}"; filename="response_body"\r\n`
        )
      );
      parts.push(Buffer.from("Content-Type: application/octet-stream\r\n\r\n"));
      parts.push(value as Buffer);
    } else {
      // Handle text data
      parts.push(
        Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`)
      );
      parts.push(Buffer.from(String(value)));
    }
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const combined = Buffer.concat(parts);

  return {
    boundary,
    body: combined.buffer.slice(
      combined.byteOffset,
      combined.byteOffset + combined.byteLength
    ) as ArrayBuffer,
  };
}

async function fetchRequest(
  url: string,
  options: {
    headers?: Record<string, string>;
    data?: any;
    multipartData?: Record<string, string | Buffer>;
    method?: string;
  }
) {
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
          const { boundary, body: multipartBody } = createMultipartFormData(
            options.multipartData
          );
          body = new Blob([multipartBody], {
            type: `multipart/form-data; boundary=${boundary}`,
          });
          requestHeaders[
            "Content-Type"
          ] = `multipart/form-data; boundary=${boundary}`;
        } else {
          // For JSON data
          body = new Blob([JSON.stringify(options.data)], {
            type: "application/json",
          });
          requestHeaders["Content-Type"] = "application/json";
        }

        const postRequest = new FetchRequest(url, {
          method: "POST",
          headers: requestHeaders,
          body: body,
        });

        return await fetch(postRequest);
    }
  } catch (error) {
    return error as Error;
  }
}

export { createMultipartFormData, fetchRequest };
