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

// api-src/pool-preview.ts
var pool_preview_exports = {};
__export(pool_preview_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(pool_preview_exports);

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

// web/raydiumPools.ts
var import_web3 = require("@solana/web3.js");
var import_spl_token = require("@solana/spl-token");
var import_bn = __toESM(require("bn.js"));
var import_decimal = __toESM(require("decimal.js"));
var import_raydium_sdk_v2 = require("@raydium-io/raydium-sdk-v2");
var WSOL = "So11111111111111111111111111111111111111112";
var MAX_SOL = 100;
function rpcUrl() {
  return process.env.SOLANA_RPC_URL?.trim() || process.env.HELIUS_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
}
function connection() {
  return new import_web3.Connection(rpcUrl(), "confirmed");
}
function pubkey(value, label) {
  try {
    return new import_web3.PublicKey(value);
  } catch {
    throw new Error(`${label} is not a Solana address.`);
  }
}
function uiAmount(value, label) {
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`${label} must be greater than 0.`);
  const amount = new import_decimal.default(text);
  if (!amount.isFinite() || amount.lte(0)) throw new Error(`${label} must be greater than 0.`);
  return amount;
}
async function mintInfo(conn, address) {
  const mint = pubkey(address, "Token mint");
  if (mint.toBase58() === WSOL) throw new Error("Choose your token mint, not wrapped SOL.");
  const account = await conn.getAccountInfo(mint);
  if (!account) throw new Error("Token mint was not found on mainnet.");
  const parsed = await (0, import_spl_token.getMint)(conn, mint, "confirmed", account.owner);
  return {
    address: mint.toBase58(),
    decimals: parsed.decimals,
    programId: account.owner.toBase58()
  };
}
async function raydiumFor(owner) {
  return import_raydium_sdk_v2.Raydium.load({
    connection: connection(),
    owner,
    cluster: "mainnet",
    disableLoadToken: true,
    disableFeatureCheck: true,
    blockhashCommitment: "confirmed"
  });
}
function feeLabel(tradeFeeRate) {
  return `${new import_decimal.default(tradeFeeRate).div(1e4).toSignificantDigits(4).toString()}%`;
}
async function previewCreatePool(mint, tokenAmount, solAmount) {
  const conn = connection();
  const token = await mintInfo(conn, mint);
  const tokens = uiAmount(tokenAmount, "Token amount");
  const sol = uiAmount(solAmount, "SOL amount");
  if (sol.gt(MAX_SOL)) throw new Error(`SOL amount cannot exceed ${MAX_SOL}.`);
  const raydium = await raydiumFor(import_web3.PublicKey.default);
  const configs = await raydium.api.getCpmmConfigs();
  const feeConfig = configs.find((item) => item.index === 0) ?? configs[0];
  if (!feeConfig) throw new Error("Raydium fee config is unavailable.");
  return {
    token,
    tokenAmount: tokens.toString(),
    solAmount: sol.toString(),
    tradeFee: feeLabel(feeConfig.tradeFeeRate),
    createFeeSol: new import_decimal.default(feeConfig.createPoolFee).div(1e9).toString()
  };
}
var TOKEN_PROGRAMS = [
  new import_web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  new import_web3.PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
];

// web/poolApi.ts
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
function runPreview(req, res) {
  return guarded(req, res, async () => {
    const raw = JSON.parse(await readBody(req));
    json(
      res,
      200,
      await previewCreatePool(String(raw.mint || ""), String(raw.tokenAmount ?? ""), String(raw.solAmount ?? ""))
    );
  });
}

// api-src/pool-preview.ts
var handler = endpoint(runPreview);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
