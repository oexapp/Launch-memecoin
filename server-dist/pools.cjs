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

// api-src/pools.ts
var pools_exports = {};
__export(pools_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(pools_exports);

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
var TOKEN_PROGRAMS = [
  new import_web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  new import_web3.PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
];
function mintField(value, field) {
  if (!value || typeof value !== "object") return "";
  const item = value[field];
  return typeof item === "string" ? item : "";
}
function poolRows(body) {
  if (!body || typeof body !== "object") return [];
  const data = body.data;
  const rows = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray(data.data) ? data.data : [];
  return rows.filter((row) => Boolean(row) && typeof row === "object");
}
async function listOwnerPools(owner) {
  const ownerKey = pubkey(owner, "Wallet");
  const conn = connection();
  const balances = /* @__PURE__ */ new Map();
  for (const programId of TOKEN_PROGRAMS) {
    const accounts = await conn.getParsedTokenAccountsByOwner(ownerKey, { programId });
    for (const item of accounts.value) {
      const info = item.account.data.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      if (!info || !tokenAmount?.amount) continue;
      const raw = BigInt(tokenAmount.amount);
      if (raw <= 0n) continue;
      const mint = String(info.mint || "");
      if (!mint || mint === WSOL) continue;
      const current = balances.get(mint);
      balances.set(mint, {
        raw: (current?.raw ?? 0n) + raw,
        decimals: Number(tokenAmount.decimals ?? current?.decimals ?? 0)
      });
    }
  }
  const mints = [...balances.keys()];
  const found = [];
  for (let index = 0; index < mints.length && index < 200; index += 20) {
    const batch = mints.slice(index, index + 20);
    const response = await fetch(`https://api-v3.raydium.io/pools/info/lps?lps=${batch.join(",")}`);
    if (!response.ok) continue;
    found.push(...poolRows(await response.json()));
  }
  let solPrice = 0;
  try {
    const response = await fetch(
      "https://api-v3.raydium.io/mint/price?mints=So11111111111111111111111111111111111111112"
    );
    const body = await response.json();
    solPrice = Number(body.data?.[WSOL] || 0);
  } catch {
    solPrice = 0;
  }
  const pools = found.flatMap((pool) => {
    const lpMint = mintField(pool.lpMint, "address");
    const held = balances.get(lpMint);
    const solIsA = mintField(pool.mintA, "address") === WSOL;
    const solIsB = mintField(pool.mintB, "address") === WSOL;
    if (!held || !solIsA && !solIsB) return [];
    const supply = new import_decimal.default(String(pool.lpAmount || "0"));
    if (!supply.isFinite() || supply.lte(0)) return [];
    const decimals = Number(pool.lpMint?.decimals ?? held.decimals);
    const share = new import_decimal.default(held.raw.toString()).div(new import_decimal.default(10).pow(decimals)).div(supply);
    if (share.lte(0)) return [];
    const amountA = new import_decimal.default(String(pool.mintAmountA || "0"));
    const amountB = new import_decimal.default(String(pool.mintAmountB || "0"));
    const solAmount = share.mul(solIsA ? amountA : amountB);
    const tokenAmount = share.mul(solIsA ? amountB : amountA);
    const token = solIsA ? pool.mintB : pool.mintA;
    const valueUsd = share.mul(new import_decimal.default(String(pool.tvl || "0")));
    const valueSol = solPrice > 0 ? valueUsd.div(solPrice) : solAmount.mul(2);
    return [
      {
        poolId: String(pool.id || ""),
        tokenMint: mintField(token, "address"),
        tokenSymbol: mintField(token, "symbol") || "TOKEN",
        solAmount: solAmount.toSignificantDigits(8).toString(),
        tokenAmount: tokenAmount.toSignificantDigits(8).toString(),
        valueUsd: valueUsd.toSignificantDigits(8).toString(),
        valueSol: valueSol.toSignificantDigits(8).toString()
      }
    ];
  });
  pools.sort((left, right) => Number(right.valueUsd) - Number(left.valueUsd));
  return pools;
}

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
function runPools(req, res) {
  return guarded(req, res, async () => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    json(res, 200, { pools: await listOwnerPools(url.searchParams.get("owner") || "") });
  });
}

// api-src/pools.ts
var handler = endpoint(runPools);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
