import fs from "fs";
import http from "http";
import path from "path";

const PAGE_PATH = path.join(process.cwd(), "public", "index.html");
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL?.trim() || process.env.HELIUS_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
}

export function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function readBody(req: http.IncomingMessage, max = 32_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const finish = () => resolve(Buffer.concat(chunks).toString("utf8"));
    if (typeof req.on !== "function") {
      finish();
      return;
    }
    req.on("data", (chunk: Buffer) => {
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

export function sameSite(req: http.IncomingMessage): boolean {
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

function decodeDataImage(value: string): { bytes: Buffer; type: string; ext: string } {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) throw new Error("Image must be a PNG or JPG.");
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 3MB or smaller.");
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

export async function publishMetadata(raw: Record<string, unknown>) {
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

export function sendPage(res: http.ServerResponse) {
  const file = fs.readFileSync(PAGE_PATH);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(file);
}
