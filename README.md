# Clones Supply API

This project provides a simple API to query the total and circulating supply of the CLONES token on the Base blockchain, as well as cached price data for multiple tokens (ETH, WETH, USDC, CLONES) from CoinGecko. It is designed to be used by crypto-asset aggregators and data platforms that require stable endpoints for token metrics.

The server is built with Node.js and Express, uses `viem` for blockchain interaction, includes CoinGecko integration with intelligent caching, and is configured for easy deployment on [Fly.io](https://fly.io/).

## Prerequisites

- Node.js v20 or later
- npm
- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) (for deployment)
- A Base L1 RPC endpoint URL (e.g., from Infura, Alchemy, or another provider)

## Local Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd clones-supply-api
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create an environment file:**
    Copy the example `.env.example` to a new `.env` file:
    ```bash
    cp .env.example .env
    ```
    Then, edit `.env` and configure the required variables:
    ```
    BASE_RPC_URL="https://your-base-mainnet-rpc-url.com"
    API_KEY="your-secret-api-key"  # Optional, for production security
    NODE_ENV="development"          # Set to "production" in production
    ```

4.  **Configure Locked Addresses:**
    Open `server.js` and add your team, vesting, and treasury addresses to the `LOCKED_ADDRESSES` array. This is critical for an accurate circulating supply calculation.

5.  **Run the server:**
    For development (with auto-reloading):
    ```bash
    npm run dev
    ```
    For production mode:
    ```bash
    npm start
    ```
    The server will be available at `http://localhost:8080`.

## API Endpoints

### Supply Endpoints (Public)

-   `GET /total`
    Returns the total supply of the CLONES token as a plain text number.
    
-   `GET /circulating`
    Returns the circulating supply (`totalSupply` - `burned` - `locked`) as a plain text number.

-   `GET /supply`
    Returns a JSON object with detailed supply information:
    ```json
    {
      "total": 1000000000,
      "circulating": 950000000,
      "decimals": 18,
      "updated_at": "2025-09-18T10:00:00.000Z"
    }
    ```

### Price Endpoints (Secured in Production)

-   `GET /price/:symbol`
    Returns the current USD price for a specific token as plain text.
    Supported symbols: `ETH`, `WETH`, `USDC`, `CLONES`
    
    Example: `GET /price/eth` → `3975.26`

-   `GET /prices`
    Returns USD prices for all supported tokens:
    ```json
    {
      "prices": {
        "ETH": 3975.26,
        "WETH": 3975.26,
        "USDC": 0.999877,
        "CLONES": 0.00032924
      },
      "updated_at": "2025-10-28T20:53:52.323Z"
    }
    ```

### Utility Endpoints

-   `GET /health`
    A simple health check endpoint that returns `OK` with a status code of `200`. Used by Fly.io for monitoring.

## Security

### Development Mode
In development (`NODE_ENV=development`), all endpoints are publicly accessible.

### Production Mode
In production (`NODE_ENV=production`), price endpoints require authentication:
- Supply endpoints remain public
- Price endpoints require an `X-API-Key` header or `Authorization: Bearer <token>` header
- Set the `API_KEY` environment variable to enable authentication

Example authenticated request:
```bash
curl -H "X-API-Key: your-secret-key" https://your-api.fly.dev/price/eth
```

## Caching

All data is cached for 30 minutes to optimize performance and reduce external API calls:
- Supply data is fetched from the Base blockchain
- Price data is fetched from CoinGecko API
- Cache is warmed up automatically on server startup

## Deployment to Fly.io

1.  **Login to flyctl:**
    ```bash
    fly auth login
    ```

2.  **Launch the app:**
    The first time you deploy, you can use `fly launch`. It will use the `fly.toml` file.
    ```bash
    fly launch --copy-config --no-deploy
    ```
    *Review the settings in the generated `fly.toml` file. The provided file should be a good starting point.*

3.  **Set the secrets:**
    Your sensitive environment variables should not be committed to git. Set them on Fly.io using:
    ```bash
    fly secrets set BASE_RPC_URL="https://your-base-mainnet-rpc-url.com"
    fly secrets set API_KEY="your-production-api-key"
    fly secrets set NODE_ENV="production"
    ```

4.  **Deploy the application:**
    ```bash
    fly deploy
    ```
    `flyctl` will build the Docker image, push it to Fly.io's registry, and deploy the application. You will get a public URL for your API.
