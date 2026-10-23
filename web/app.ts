import http from "http";
import { json, sendPage } from "./http";
import { runMetadata, runRpc } from "./light";
import { runBuild, runPool, runPools, runPreview } from "./poolApi";

export async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === "/api/metadata") return runMetadata(req, res);
  if (req.method === "POST" && url.pathname === "/api/rpc") return runRpc(req, res);
  if (req.method === "GET" && url.pathname === "/api/pools") return runPools(req, res);
  if (req.method === "GET" && url.pathname === "/api/pool") return runPool(req, res);
  if (req.method === "POST" && url.pathname === "/api/pool/preview") return runPreview(req, res);
  if (req.method === "POST" && url.pathname === "/api/pool/build") return runBuild(req, res);
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/launch")) {
    sendPage(res);
    return;
  }
  json(res, 404, { error: "Not found" });
}
