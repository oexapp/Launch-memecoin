import type { IncomingMessage, ServerResponse } from "http";
import { json, readBody, sameSite } from "./http";
import {
  buildAddLiquidity,
  buildCreatePool,
  listOwnerPools,
  lookupPool,
  previewCreatePool,
} from "./raydiumPools";

async function guarded(req: IncomingMessage, res: ServerResponse, run: () => Promise<void>) {
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

export function runPools(req: IncomingMessage, res: ServerResponse) {
  return guarded(req, res, async () => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    json(res, 200, { pools: await listOwnerPools(url.searchParams.get("owner") || "") });
  });
}

export function runPool(req: IncomingMessage, res: ServerResponse) {
  return guarded(req, res, async () => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    json(res, 200, await lookupPool(url.searchParams.get("id") || ""));
  });
}

export function runPreview(req: IncomingMessage, res: ServerResponse) {
  return guarded(req, res, async () => {
    const raw = JSON.parse(await readBody(req)) as Record<string, unknown>;
    json(
      res,
      200,
      await previewCreatePool(String(raw.mint || ""), String(raw.tokenAmount ?? ""), String(raw.solAmount ?? ""))
    );
  });
}

export function runBuild(req: IncomingMessage, res: ServerResponse) {
  return guarded(req, res, async () => {
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
  });
}
