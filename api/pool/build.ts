import { endpoint } from "../../web/endpoint";
import { runBuild } from "../../web/poolApi";

export const config = { api: { bodyParser: false } };
export const maxDuration = 60;

export default endpoint(runBuild);
