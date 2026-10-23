import type { IncomingMessage, ServerResponse } from "http";
import { handleRequest } from "../web/app";

export const config = {
  api: {
    bodyParser: false,
  },
};

export const maxDuration = 60;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleRequest(req, res);
}
