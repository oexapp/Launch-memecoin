import { endpoint } from "../web/endpoint";
import { runMetadata } from "../web/light";

export const handler = endpoint(runMetadata);
