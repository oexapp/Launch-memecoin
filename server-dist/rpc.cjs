"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api-src/rpc.ts
var rpc_exports = {};
__export(rpc_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(rpc_exports);

// web/endpoint.ts
function endpoint(run) {
  return function handler2(req, res) {
    return Promise.resolve(run(req, res)).catch((error) => {
      if (res.headersSent) return;
      const message = error instanceof Error ? error.message : "Request failed";
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: message }));
    });
  };
}

// web/http.ts
var import_path = __toESM(require("path"));
var PAGE_PATH = import_path.default.join(process.cwd(), "public", "index.html");
var MAX_IMAGE_BYTES = 3 * 1024 * 1024;
function rpcUrl() {
  return process.env.SOLANA_RPC_URL?.trim() || process.env.HELIUS_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
}
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}
function readBody(req, max = 32e3) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const finish = () => resolve(Buffer.concat(chunks).toString("utf8"));
    if (typeof req.on !== "function") {
      finish();
      return;
    }
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    });
    req.on("end", finish);
    req.on("error", reject);
  });
}
function sameSite(req) {
  if (!process.env.VERCEL) return true;
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") return false;
  try {
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

// web/light.ts
async function guarded(req, res, run) {
  try {
    if (!sameSite(req)) {
      json(res, 403, { error: "Open this page in the browser and try again." });
      return;
    }
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    if (!res.headersSent) json(res, 400, { error: message });
  }
}
function runRpc(req, res) {
  return guarded(req, res, async () => {
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }
    const body = await readBody(req, 2e5);
    const upstream = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(text);
  });
}

// api-src/rpc.ts
var handler = endpoint(runRpc);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
