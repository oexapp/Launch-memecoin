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

// api-src/metadata.ts
var metadata_exports = {};
__export(metadata_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(metadata_exports);

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
function decodeDataImage(value) {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) throw new Error("Image must be a PNG or JPG.");
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 3MB or smaller.");
  }
  return { bytes, type: match[1], ext: match[1] === "image/png" ? "png" : "jpg" };
}
function httpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" || value.trim().length > 200) {
    throw new Error("Image URL must be an https link.");
  }
  return value.trim();
}
async function uploadPublicFile(bytes, filename, type) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", new Blob([new Uint8Array(bytes)], { type }), filename);
  const response = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
  const text = (await response.text()).trim();
  if (!response.ok || !text.startsWith("https://")) {
    throw new Error(text || "Could not publish the token logo.");
  }
  return text;
}
async function publishMetadata(raw) {
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 32) : "";
  const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().slice(0, 10) : "";
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, 200) : "";
  if (!name || !symbol) throw new Error("Name and symbol are required.");
  let image = httpsUrl(raw.imageUrl);
  if (typeof raw.imageData === "string" && raw.imageData.startsWith("data:image/")) {
    const file = decodeDataImage(raw.imageData);
    image = await uploadPublicFile(file.bytes, `logo.${file.ext}`, file.type);
  }
  const metadata = { name, symbol, description, image };
  const uri = await uploadPublicFile(Buffer.from(JSON.stringify(metadata)), "metadata.json", "application/json");
  return { uri, image };
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
function runMetadata(req, res) {
  return guarded(req, res, async () => {
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }
    const raw = JSON.parse(await readBody(req, 42e5));
    json(res, 200, await publishMetadata(raw));
  });
}

// api-src/metadata.ts
var handler = endpoint(runMetadata);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
