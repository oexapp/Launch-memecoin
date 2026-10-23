import { endpoint } from "../web/endpoint";
import { runPools } from "../web/poolApi";

export const handler = endpoint(runPools);
