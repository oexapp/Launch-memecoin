import { endpoint } from "../web/endpoint";
import { runRpc } from "../web/light";

export const handler = endpoint(runRpc);
