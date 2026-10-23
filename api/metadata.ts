import { endpoint } from "../web/endpoint";
import { runMetadata } from "../web/light";

export const config = { api: { bodyParser: false } };
export const maxDuration = 60;

export default endpoint(runMetadata);
