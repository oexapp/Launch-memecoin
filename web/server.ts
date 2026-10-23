import http from "http";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  buildAddLiquidity,
  buildCreatePool,
  listOwnerPools,
  lookupPool,
  previewCreatePool,
} from "./raydiumPools";

dotenv.config();

const HOST = "127.0.0.1";
const PORT = Number(process.env.WEB_PORT || 8787);
const PUBLIC_DIR = path.join(__dirname, "public");

function rpcUrl(): string {
  return process.env.HELIUS_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage, max = 32_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function decodeDataImage(value: string): { bytes: Buffer; type: string; ext: string } {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) throw new Error("Image must be a PNG or JPG.");
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
    throw new Error("Image must be 5MB or smaller.");
  }
  return { bytes, type: match[1], ext: match[1] === "image/png" ? "png" : "jpg" };
}

function httpsUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" || value.trim().length > 200) {
    throw new Error("Image URL must be an https link.");
  }
  return value.trim();
}

async function uploadPublicFile(bytes: Buffer, filename: string, type: string): Promise<string> {
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

async function publishMetadata(raw: Record<string, unknown>) {
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 32) : "";
  const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().slice(0, 10) : "";
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, 200) : "";
  if (!name || !symbol) throw new Error("Name and symbol are required.");
  let image = httpsUrl(raw.imageUrl);
  if (typeof raw.imageData === "string" && raw.imageData.startsWith("data:image/")) {
    const file = decodeDataImage(raw.imageData);
    image = await uploadPublicFile(file.bytes, `logo.${file.ext}`, file.type);
  }
  const metadata = {
    name,
    symbol,
    description,
    image,
  };
  const uri = await uploadPublicFile(Buffer.from(JSON.stringify(metadata)), "metadata.json", "application/json");
  return { uri, image };
}

function sendPage(res: http.ServerResponse) {
  const file = fs.readFileSync(path.join(PUBLIC_DIR, "launch.html"));
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(file);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}`);
    if (req.method === "POST" && url.pathname === "/api/metadata") {
      const raw = JSON.parse(await readBody(req, 8_000_000)) as Record<string, unknown>;
      json(res, 200, await publishMetadata(raw));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/pools") {
      json(res, 200, { pools: await listOwnerPools(url.searchParams.get("owner") || "") });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/pool") {
      json(res, 200, await lookupPool(url.searchParams.get("id") || ""));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pool/preview") {
      const raw = JSON.parse(await readBody(req)) as Record<string, unknown>;
      json(
        res,
        200,
        await previewCreatePool(
          String(raw.mint || ""),
          String(raw.tokenAmount ?? ""),
          String(raw.solAmount ?? "")
        )
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pool/build") {
      const raw = JSON.parse(await readBody(req)) as Record<string, unknown>;
      if (raw.confirm !== true) {
        json(res, 400, { error: "Confirm the deposit before the wallet opens." });
        return;
      }
      if (raw.action === "add") {
        json(
          res,
          200,
          await buildAddLiquidity({
            owner: String(raw.owner || ""),
            poolId: String(raw.poolId || ""),
            inputSide: raw.inputSide === "sol" ? "sol" : "token",
            amount: String(raw.amount ?? ""),
          })
        );
        return;
      }
      json(
        res,
        200,
        await buildCreatePool({
          owner: String(raw.owner || ""),
          mint: String(raw.mint || ""),
          tokenAmount: String(raw.tokenAmount ?? ""),
          solAmount: String(raw.solAmount ?? ""),
        })
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/rpc") {
      const body = await readBody(req, 200_000);
      const upstream = await fetch(rpcUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(text);
      return;
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/launch")) {
      sendPage(res);
      return;
    }
    json(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    json(res, 400, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Web UI: http://${HOST}:${PORT}`);
});
