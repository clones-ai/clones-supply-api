# Clones Supply API

This project provides a simple, public API to query the total and circulating supply of the CLONES token on the Base blockchain. It is designed to be used by crypto-asset aggregators and data platforms that require a stable, unauthenticated endpoint for token metrics.

The server is built with Node.js and Express, uses `viem` for blockchain interaction, and is configured for easy deployment on [Fly.io](https://fly.io/).

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
    Then, edit `.env` and add your Base RPC URL:
    ```
    BASE_RPC_URL="https://your-base-mainnet-rpc-url.com"
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
-   `GET /health`
    A simple health check endpoint that returns `OK` with a status code of `200`. Used by Fly.io for monitoring.

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

3.  **Set the RPC secret:**
    Your `BASE_RPC_URL` is a secret and should not be committed to git. Set it on Fly.io using:
    ```bash
    fly secrets set BASE_RPC_URL="https://your-base-mainnet-rpc-url.com"
    ```

4.  **Deploy the application:**
    ```bash
    fly deploy
    ```
    `flyctl` will build the Docker image, push it to Fly.io's registry, and deploy the application. You will get a public URL for your API.
