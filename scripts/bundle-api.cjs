const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const jobs = [
  ["rpc.ts", "rpc.cjs", false],
  ["metadata.ts", "metadata.cjs", false],
  ["pools.ts", "pools.cjs", true],
  ["pool-index.ts", "pool-index.cjs", true],
  ["pool-preview.ts", "pool-preview.cjs", true],
  ["pool-build.ts", "pool-build.cjs", true],
];

async function main() {
  const outDir = path.join(root, "server-dist");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [entry, outfile, heavy] of jobs) {
    const destination = path.join(outDir, outfile);
    await esbuild.build({
      absWorkingDir: root,
      entryPoints: [path.join("api-src", entry)],
      outfile: destination,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node20",
      packages: "external",
      legalComments: "none",
      logLevel: "warning",
    });
    const text = fs.readFileSync(destination, "utf8");
    if (!text.includes("handler: () => handler")) {
      throw new Error(`${outfile} is missing the handler export`);
    }
    if (!heavy && (text.includes("raydium") || text.includes("@solana/web3.js"))) {
      throw new Error(`${outfile} bundled a heavy dependency`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
