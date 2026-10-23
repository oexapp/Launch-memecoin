import { endpoint } from "../web/endpoint";
import { runBuild } from "../web/poolApi";

export const handler = endpoint(runBuild);
