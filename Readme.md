# Launch Coin

Solana page for creating a token in Phantom and opening or adding to a Raydium SOL pool. Transactions are signed in your wallet. This app does not take a platform fee.

## Local

```bash
npm install
npm run web
```

Open http://127.0.0.1:8787.

## Vercel

1. Import this folder as a Vercel project.
2. In Project Settings → Environment Variables, set `SOLANA_RPC_URL` to your Alchemy mainnet URL. If it is empty, the public Solana RPC is used and rate limits are more likely.
3. Deploy. The site is served from `/`, and the API runs as a serverless function under `/api`.

Logos are limited to 3MB because Vercel rejects request bodies larger than 4.5MB. A public `https://` image link can be used instead of an upload. Raydium still charges its own pool-creation fee, which Phantom shows before you approve.
