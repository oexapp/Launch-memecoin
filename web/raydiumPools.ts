import { Connection, Keypair, PublicKey, Signer, VersionedTransaction } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import BN from "bn.js";
import Decimal from "decimal.js";
import {
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  Percent,
  Raydium,
  TxVersion,
} from "@raydium-io/raydium-sdk-v2";

const WSOL = "So11111111111111111111111111111111111111112";
const MAX_SOL = 100;

function rpcUrl() {
  return process.env.SOLANA_RPC_URL?.trim() || process.env.HELIUS_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
}

function connection() {
  return new Connection(rpcUrl(), "confirmed");
}

function pubkey(value: string, label: string) {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a Solana address.`);
  }
}

function uiAmount(value: string, label: string) {
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`${label} must be greater than 0.`);
  const amount = new Decimal(text);
  if (!amount.isFinite() || amount.lte(0)) throw new Error(`${label} must be greater than 0.`);
  return amount;
}

function rawAmount(amount: Decimal, decimals: number) {
  const text = amount.mul(new Decimal(10).pow(decimals)).toFixed(0);
  if (!/^[1-9]\d*$/.test(text) && text !== "0") {
    throw new Error("Amount is too precise for this token.");
  }
  if (text === "0") throw new Error("Amount rounds down to zero.");
  return new BN(text);
}

async function mintInfo(conn: Connection, address: string) {
  const mint = pubkey(address, "Token mint");
  if (mint.toBase58() === WSOL) throw new Error("Choose your token mint, not wrapped SOL.");
  const account = await conn.getAccountInfo(mint);
  if (!account) throw new Error("Token mint was not found on mainnet.");
  const parsed = await getMint(conn, mint, "confirmed", account.owner);
  return {
    address: mint.toBase58(),
    decimals: parsed.decimals,
    programId: account.owner.toBase58(),
  };
}

const wsolInfo = {
  address: WSOL,
  decimals: 9,
  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
};

async function raydiumFor(owner: PublicKey) {
  return Raydium.load({
    connection: connection(),
    owner,
    cluster: "mainnet",
    disableLoadToken: true,
    disableFeatureCheck: true,
    blockhashCommitment: "confirmed",
  });
}

function feeLabel(tradeFeeRate: number) {
  return `${new Decimal(tradeFeeRate).div(10_000).toSignificantDigits(4).toString()}%`;
}

function serialize(tx: VersionedTransaction, signers: Signer[]) {
  const keypairs = signers.filter((signer): signer is Keypair => "secretKey" in signer);
  if (keypairs.length) tx.sign(keypairs);
  const bytes = (
    tx.serialize as (config?: { requireAllSignatures?: boolean; verifySignatures?: boolean }) => Uint8Array
  )({ requireAllSignatures: false, verifySignatures: false });
  return Buffer.from(bytes).toString("base64");
}

export async function previewCreatePool(mint: string, tokenAmount: string, solAmount: string) {
  const conn = connection();
  const token = await mintInfo(conn, mint);
  const tokens = uiAmount(tokenAmount, "Token amount");
  const sol = uiAmount(solAmount, "SOL amount");
  if (sol.gt(MAX_SOL)) throw new Error(`SOL amount cannot exceed ${MAX_SOL}.`);
  const raydium = await raydiumFor(PublicKey.default);
  const configs = await raydium.api.getCpmmConfigs();
  const feeConfig = configs.find((item) => item.index === 0) ?? configs[0];
  if (!feeConfig) throw new Error("Raydium fee config is unavailable.");
  return {
    token,
    tokenAmount: tokens.toString(),
    solAmount: sol.toString(),
    tradeFee: feeLabel(feeConfig.tradeFeeRate),
    createFeeSol: new Decimal(feeConfig.createPoolFee).div(1_000_000_000).toString(),
  };
}

export async function buildCreatePool(input: {
  owner: string;
  mint: string;
  tokenAmount: string;
  solAmount: string;
}) {
  const preview = await previewCreatePool(input.mint, input.tokenAmount, input.solAmount);
  const owner = pubkey(input.owner, "Wallet");
  const raydium = await raydiumFor(owner);
  const configs = await raydium.api.getCpmmConfigs();
  const feeConfig = configs.find((item) => item.index === 0) ?? configs[0];
  const built = await raydium.cpmm.createPool({
    programId: CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC,
    mintA: preview.token,
    mintB: wsolInfo,
    mintAAmount: rawAmount(new Decimal(preview.tokenAmount), preview.token.decimals),
    mintBAmount: rawAmount(new Decimal(preview.solAmount), 9),
    startTime: new BN(0),
    feeConfig,
    associatedOnly: false,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.V0,
  });
  return {
    transaction: serialize(built.transaction, built.signers),
    poolId: built.extInfo.address.poolId.toBase58(),
    summary: {
      tokenAmount: preview.tokenAmount,
      solAmount: preview.solAmount,
      tradeFee: preview.tradeFee,
      createFeeSol: preview.createFeeSol,
    },
  };
}

export async function lookupPool(poolId: string) {
  const id = pubkey(poolId, "Pool");
  const raydium = await raydiumFor(PublicKey.default);
  const { poolInfo, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(id.toBase58());
  const solIsA = poolInfo.mintA.address === WSOL;
  const solIsB = poolInfo.mintB.address === WSOL;
  if (!solIsA && !solIsB) throw new Error("This form only handles pools paired with SOL.");
  const token = solIsA ? poolInfo.mintB : poolInfo.mintA;
  const solReserve = solIsA ? rpcData.baseReserve : rpcData.quoteReserve;
  const tokenReserve = solIsA ? rpcData.quoteReserve : rpcData.baseReserve;
  return {
    poolId: id.toBase58(),
    tokenMint: token.address,
    tokenDecimals: token.decimals,
    solReserve: new Decimal(solReserve.toString()).div(new Decimal(10).pow(9)).toString(),
    tokenReserve: new Decimal(tokenReserve.toString())
      .div(new Decimal(10).pow(token.decimals))
      .toString(),
  };
}

export async function buildAddLiquidity(input: {
  owner: string;
  poolId: string;
  inputSide: "token" | "sol";
  amount: string;
}) {
  const owner = pubkey(input.owner, "Wallet");
  const pool = await lookupPool(input.poolId);
  const amount = uiAmount(input.amount, "Amount");
  if (input.inputSide === "sol" && amount.gt(MAX_SOL)) {
    throw new Error(`SOL amount cannot exceed ${MAX_SOL}.`);
  }
  const raydium = await raydiumFor(owner);
  const { poolInfo, poolKeys, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(pool.poolId);
  const solIsA = poolInfo.mintA.address === WSOL;
  const baseIn = input.inputSide === "sol" ? solIsA : !solIsA;
  const slippage = new Percent(1, 100);
  const epochInfo = await connection().getEpochInfo();
  const paired = raydium.cpmm.computePairAmount({
    poolInfo,
    baseReserve: rpcData.baseReserve,
    quoteReserve: rpcData.quoteReserve,
    amount: amount.toFixed(),
    slippage,
    epochInfo,
    baseIn,
  });
  const otherDecimals = baseIn ? poolInfo.mintB.decimals : poolInfo.mintA.decimals;
  const built = await raydium.cpmm.addLiquidity({
    poolInfo,
    poolKeys,
    inputAmount: rawAmount(amount, baseIn ? poolInfo.mintA.decimals : poolInfo.mintB.decimals),
    baseIn,
    slippage,
    txVersion: TxVersion.V0,
  });
  return {
    transaction: serialize(built.transaction, built.signers),
    poolId: pool.poolId,
    summary: {
      inputSide: input.inputSide,
      inputAmount: amount.toString(),
      otherAmount: new Decimal(paired.anotherAmount.amount.toString())
        .div(new Decimal(10).pow(otherDecimals))
        .toSignificantDigits(8)
        .toString(),
    },
  };
}

const TOKEN_PROGRAMS = [
  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
];

function mintField(value: unknown, field: "address" | "symbol"): string {
  if (!value || typeof value !== "object") return "";
  const item = (value as Record<string, unknown>)[field];
  return typeof item === "string" ? item : "";
}

function poolRows(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : [];
  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

export async function listOwnerPools(owner: string) {
  const ownerKey = pubkey(owner, "Wallet");
  const conn = connection();
  const balances = new Map<string, { raw: bigint; decimals: number }>();
  for (const programId of TOKEN_PROGRAMS) {
    const accounts = await conn.getParsedTokenAccountsByOwner(ownerKey, { programId });
    for (const item of accounts.value) {
      const info = (item.account.data as { parsed?: { info?: Record<string, unknown> } }).parsed?.info;
      const tokenAmount = info?.tokenAmount as { amount?: string; decimals?: number } | undefined;
      if (!info || !tokenAmount?.amount) continue;
      const raw = BigInt(tokenAmount.amount);
      if (raw <= 0n) continue;
      const mint = String(info.mint || "");
      if (!mint || mint === WSOL) continue;
      const current = balances.get(mint);
      balances.set(mint, {
        raw: (current?.raw ?? 0n) + raw,
        decimals: Number(tokenAmount.decimals ?? current?.decimals ?? 0),
      });
    }
  }

  const mints = [...balances.keys()];
  const found: Record<string, unknown>[] = [];
  for (let index = 0; index < mints.length && index < 200; index += 20) {
    const batch = mints.slice(index, index + 20);
    const response = await fetch(`https://api-v3.raydium.io/pools/info/lps?lps=${batch.join(",")}`);
    if (!response.ok) continue;
    found.push(...poolRows(await response.json()));
  }

  let solPrice = 0;
  try {
    const response = await fetch(
      "https://api-v3.raydium.io/mint/price?mints=So11111111111111111111111111111111111111112"
    );
    const body = (await response.json()) as { data?: Record<string, string> };
    solPrice = Number(body.data?.[WSOL] || 0);
  } catch {
    solPrice = 0;
  }

  const pools = found.flatMap((pool) => {
    const lpMint = mintField(pool.lpMint, "address");
    const held = balances.get(lpMint);
    const solIsA = mintField(pool.mintA, "address") === WSOL;
    const solIsB = mintField(pool.mintB, "address") === WSOL;
    if (!held || (!solIsA && !solIsB)) return [];
    const supply = new Decimal(String(pool.lpAmount || "0"));
    if (!supply.isFinite() || supply.lte(0)) return [];
    const decimals = Number((pool.lpMint as { decimals?: number })?.decimals ?? held.decimals);
    const share = new Decimal(held.raw.toString()).div(new Decimal(10).pow(decimals)).div(supply);
    if (share.lte(0)) return [];
    const amountA = new Decimal(String(pool.mintAmountA || "0"));
    const amountB = new Decimal(String(pool.mintAmountB || "0"));
    const solAmount = share.mul(solIsA ? amountA : amountB);
    const tokenAmount = share.mul(solIsA ? amountB : amountA);
    const token = solIsA ? pool.mintB : pool.mintA;
    const valueUsd = share.mul(new Decimal(String(pool.tvl || "0")));
    const valueSol = solPrice > 0 ? valueUsd.div(solPrice) : solAmount.mul(2);
    return [
      {
        poolId: String(pool.id || ""),
        tokenMint: mintField(token, "address"),
        tokenSymbol: mintField(token, "symbol") || "TOKEN",
        solAmount: solAmount.toSignificantDigits(8).toString(),
        tokenAmount: tokenAmount.toSignificantDigits(8).toString(),
        valueUsd: valueUsd.toSignificantDigits(8).toString(),
        valueSol: valueSol.toSignificantDigits(8).toString(),
      },
    ];
  });

  pools.sort((left, right) => Number(right.valueUsd) - Number(left.valueUsd));
  return pools;
}
