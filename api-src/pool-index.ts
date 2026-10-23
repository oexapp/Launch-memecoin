import { endpoint } from "../web/endpoint";
import { runPool } from "../web/poolApi";

export const handler = endpoint(runPool);
