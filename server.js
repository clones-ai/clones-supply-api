// server.js
import 'dotenv/config';
import express from 'express';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import rateLimit from 'express-rate-limit';

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const RPC_URL = process.env.BASE_RPC_URL;
const API_KEY = process.env.API_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!RPC_URL) {
    throw new Error('BASE_RPC_URL is not defined in the environment variables.');
}

const CLONES_CONTRACT_ADDRESS = '0xaadd98Ad4660008C917C6FE7286Bc54b2eEF894d';

// A minimal ERC20 ABI to get totalSupply, decimals, and balanceOf
const erc20Abi = [
    {
        "constant": true,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{ "name": "", "type": "uint256" }],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "name": "", "type": "uint8" }],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [{ "name": "_owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "balance", "type": "uint256" }],
        "type": "function"
    }
];

const BURN_ADDRESSES = [
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dEaD'
];

// IMPORTANT: Add your team, vesting, and treasury addresses here
const LOCKED_ADDRESSES = [
    '0xe2326bB154053cF3A96BC3484e9f2c4D12cA445F', // KOLS
    '0x15FecCC979828DE7aF82ec1f4672d519cF1b7F09', // Teams
    '0xCA5996B9447c092458D46eb143b8E9c332F65C76', // Marketing
    '0x750FF2F710FbB1Aa08E4C69e0F96Ea4b39eA2299', // Rewards
    '0xb5d78dd3276325f5faf3106cc4acc56e28e0fe3b', // Sablier (Teams)
];

// --- Viem Client ---
const client = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
});

// --- In-memory Cache ---
const cache = {
    data: null,
    lastUpdated: 0,
};

const priceCache = {
    data: null,
    lastUpdated: 0,
};

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Token mappings for CoinGecko API
const TOKEN_MAPPINGS = {
    'ETH': 'ethereum',
    'WETH': 'ethereum',
    'USDC': 'usd-coin',
    'CLONES': 'clones'
};

// --- Supply Calculation Logic ---
async function getSupplyData() {
    const now = Date.now();
    if (cache.data && (now - cache.lastUpdated < CACHE_DURATION_MS)) {
        return cache.data;
    }

    console.log('Fetching fresh supply data from the blockchain...');

    const contract = {
        address: CLONES_CONTRACT_ADDRESS,
        abi: erc20Abi,
    };

    const [totalSupplyBI, decimals] = await client.multicall({
        contracts: [
            { ...contract, functionName: 'totalSupply' },
            { ...contract, functionName: 'decimals' },
        ],
        allowFailure: false,
    });

    const allLockedAddresses = [...BURN_ADDRESSES, ...LOCKED_ADDRESSES];
    const balanceOfCalls = allLockedAddresses.map(address => ({
        ...contract,
        functionName: 'balanceOf',
        args: [address],
    }));


    const balancesBI = await client.multicall({
        contracts: balanceOfCalls,
        allowFailure: false,
    });

    const totalLockedBI = balancesBI.reduce((sum, current) => sum + current, 0n);

    const totalSupply = parseFloat(formatUnits(totalSupplyBI, decimals));
    const totalLocked = parseFloat(formatUnits(totalLockedBI, decimals));

    const circulatingSupply = totalSupply - totalLocked;

    const data = {
        total: totalSupply,
        circulating: circulatingSupply,
        decimals: decimals,
        updated_at: new Date().toISOString(),
    };

    cache.data = data;
    cache.lastUpdated = now;

    console.log('Successfully updated supply data:', data);
    return data;
}

// --- Price Fetching Logic ---
async function getPriceData() {
    const now = Date.now();
    if (priceCache.data && (now - priceCache.lastUpdated < CACHE_DURATION_MS)) {
        return priceCache.data;
    }

    console.log('Fetching fresh price data from CoinGecko...');

    try {
        const coinIds = Object.values(TOKEN_MAPPINGS).join(',');
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`
        );

        if (!response.ok) {
            throw new Error(`CoinGecko API returned status ${response.status}`);
        }

        const rawData = await response.json();
        
        // Transform data to match our token symbols
        const priceData = {};
        for (const [symbol, coinId] of Object.entries(TOKEN_MAPPINGS)) {
            const price = rawData?.[coinId]?.usd;
            if (price !== undefined && price !== null) {
                priceData[symbol] = price;
            }
        }

        const data = {
            prices: priceData,
            updated_at: new Date().toISOString(),
        };

        priceCache.data = data;
        priceCache.lastUpdated = now;

        console.log('Successfully updated price data:', data);
        return data;
    } catch (error) {
        console.error('Error fetching price data:', error);
        // Return cached data if available, even if stale
        if (priceCache.data) {
            console.log('Returning stale price data due to API error');
            return priceCache.data;
        }
        throw error;
    }
}

// --- Express Server ---
const app = express();

// Security middleware for price endpoints
const priceSecurityMiddleware = (req, res, next) => {
    // Allow all requests in development
    if (NODE_ENV === 'development') {
        return next();
    }

    // In production, check for API key
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!API_KEY) {
        console.warn('API_KEY not configured, allowing request');
        return next();
    }

    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }

    next();
};

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limit each IP to 20 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

app.get('/total', async (req, res) => {
    try {
        const data = await getSupplyData();
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'public, max-age=60'); // 1-minute browser cache
        res.send(data.total.toString());
    } catch (error) {
        console.error('Error fetching total supply:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/circulating', async (req, res) => {
    try {
        const data = await getSupplyData();
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'public, max-age=60'); // 1-minute browser cache
        res.send(data.circulating.toString());
    } catch (error) {
        console.error('Error fetching circulating supply:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/supply', async (req, res) => {
    try {
        const data = await getSupplyData();
        res.setHeader('Cache-Control', 'public, max-age=60'); // 1-minute browser cache
        res.json(data);
    } catch (error) {
        console.error('Error fetching supply data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Price endpoints with security middleware
app.get('/price/:symbol', priceSecurityMiddleware, async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        
        if (!TOKEN_MAPPINGS[symbol]) {
            return res.status(400).json({ 
                error: `Token ${symbol} is not supported. Supported tokens: ${Object.keys(TOKEN_MAPPINGS).join(', ')}` 
            });
        }

        const data = await getPriceData();
        const price = data.prices[symbol];

        if (price === undefined || price === null) {
            return res.status(404).json({ 
                error: `Price not available for ${symbol}` 
            });
        }

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'public, max-age=60'); // 1-minute browser cache
        res.send(price.toString());
    } catch (error) {
        console.error(`Error fetching ${req.params.symbol} price:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/prices', priceSecurityMiddleware, async (req, res) => {
    try {
        const data = await getPriceData();
        res.setHeader('Cache-Control', 'public, max-age=60'); // 1-minute browser cache
        res.json(data);
    } catch (error) {
        console.error('Error fetching price data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Clones supply API listening on port ${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`API Key protection: ${API_KEY ? 'enabled' : 'disabled'}`);
    
    // Immediately fetch data on startup to warm up the cache
    getSupplyData().catch(console.error);
    getPriceData().catch(console.error);
});
