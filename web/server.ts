import http from "http";
import { handleRequest } from "./app";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WEB_PORT || 8787);

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    const message = error instanceof Error ? error.message : "Request failed";
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: message }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Web UI: http://${HOST}:${PORT}`);
});
