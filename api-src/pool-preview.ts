import { endpoint } from "../web/endpoint";
import { runPreview } from "../web/poolApi";

export const handler = endpoint(runPreview);
