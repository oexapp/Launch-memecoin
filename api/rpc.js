let handler;
try {
  ({ handler } = require("../server-dist/rpc.cjs"));
  if (typeof handler !== "function") throw new Error("RPC handler did not load");
} catch (error) {
  const message = error instanceof Error ? error.message : "Request failed";
  handler = function failed(_req, res) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: message }));
  };
}

module.exports = function rpc(req, res) {
  return handler(req, res);
};

module.exports.config = {
  api: { bodyParser: false },
};
