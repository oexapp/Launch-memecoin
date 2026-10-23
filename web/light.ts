import type { IncomingMessage, ServerResponse } from "http";
import { json, publishMetadata, readBody, rpcUrl, sameSite } from "./http";

async function guarded(
  req: IncomingMessage,
  res: ServerResponse,
  run: () => Promise<void>
) {
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

export function runMetadata(req: IncomingMessage, res: ServerResponse) {
  return guarded(req, res, async () => {
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }
    const raw = JSON.parse(await readBody(req, 4_200_000)) as Record<string, unknown>;
    json(res, 200, await publishMetadata(raw));
  });
}

export function runRpc(req: IncomingMessage, res: ServerResponse) {
  return guarded(req, res, async () => {
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }
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
  });
}
