import type { IncomingMessage, ServerResponse } from "http";

export const config = {
  api: {
    bodyParser: false,
  },
};

type Route = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

export function endpoint(run: Route) {
  return function handler(req: IncomingMessage, res: ServerResponse) {
    return Promise.resolve(run(req, res)).catch((error: unknown) => {
      if (res.headersSent) return;
      const message = error instanceof Error ? error.message : "Request failed";
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: message }));
    });
  };
}
