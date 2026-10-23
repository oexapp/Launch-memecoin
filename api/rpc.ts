import { endpoint } from "../web/endpoint";
import { runRpc } from "../web/light";

export const config = { api: { bodyParser: false } };

export default endpoint(runRpc);
