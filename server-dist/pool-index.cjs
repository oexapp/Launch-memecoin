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

// api-src/pool-index.ts
var pool_index_exports = {};
__export(pool_index_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(pool_index_exports);

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
async function lookupPool(poolId) {
  const id = pubkey(poolId, "Pool");
  const raydium = await raydiumFor(import_web3.PublicKey.default);
  const { poolInfo, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(id.toBase58());
  const solIsA = poolInfo.mintA.address === WSOL;
  const solIsB = poolInfo.mintB.address === WSOL;
  if (!solIsA && !solIsB) throw new Error("This form only handles pools paired with SOL.");
  const token = solIsA ? poolInfo.mintB : poolInfo.mintA;
  const solReserve = solIsA ? rpcData.baseReserve : rpcData.quoteReserve;
  const tokenReserve = solIsA ? rpcData.quoteReserve : rpcData.baseReserve;
  return {
    poolId: id.toBase58(),
    tokenMint: token.address,
    tokenDecimals: token.decimals,
    solReserve: new import_decimal.default(solReserve.toString()).div(new import_decimal.default(10).pow(9)).toString(),
    tokenReserve: new import_decimal.default(tokenReserve.toString()).div(new import_decimal.default(10).pow(token.decimals)).toString()
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
function runPool(req, res) {
  return guarded(req, res, async () => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    json(res, 200, await lookupPool(url.searchParams.get("id") || ""));
  });
}

// api-src/pool-index.ts
var handler = endpoint(runPool);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
