# XRPL Streaming Payments

A general-purpose streaming payment system built on the XRP Ledger (XRPL) using payment channels. This system enables real-time, off-chain micro-payments with zero transaction fees until finalization.

## 🌟 Features

- **Zero-Fee Streaming**: Off-chain payment streams with no transaction fees
- **Real-Time Payments**: Micropayments per second using cryptographic signatures
- **Secure**: Built on XRPL's payment channel technology
- **Auto-Reconnect**: Resilient connection management with automatic reconnection
- **RESTful API**: Easy-to-use HTTP endpoints for integration
- **Flexible Rates**: Configurable payment rates and streaming durations
- **Local State Management**: Track channel state with built-in storage

## 📁 Project Structure

```
xrpl-streaming-payments/
├── contracts/              # On-chain XRPL transaction management
│   ├── createChannel.js   # Create payment channels
│   ├── fundChannel.js     # Add funds to existing channels
│   └── claimChannel.js    # Finalize and close channels
├── src/
│   ├── core/              # Streaming engine
│   │   ├── signer.js      # Off-chain claim signing (sender)
│   │   ├── validator.js   # Claim validation (receiver)
│   │   └── channelStore.js # Local state management
│   ├── api/
│   │   ├── streamRoutes.js # API endpoints
│   │   └── middleware.js   # Auth and validation
│   └── utils/
│       ├── xrplClient.js   # XRPL connection manager
│       └── converters.js   # XRP/drops conversion utilities
├── public/                 # Frontend assets
├── config.js              # Configuration constants
├── server.js              # Application entry point
└── package.json           # Dependencies
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd xrpl-streaming-payments
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and configure:
- `XRPL_NETWORK`: Choose `testnet` (default), `devnet`, or `mainnet`
- `API_KEY`: Set a secure API key for authentication
- `PORT`: API server port (default: 3000)

4. Get test credentials:
   - Visit [XRPL Testnet Faucet](https://xrpl.org/xrp-testnet-faucet.html)
   - Generate sender and receiver wallets
   - Save the seeds in `.env` (for testing only!)

### Running the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The API will be available at `http://localhost:3000`

## 📖 Usage Guide

### 1. Create a Payment Channel

First, create a payment channel on the XRPL:

```javascript
const { createChannel } = require('./contracts/createChannel');
const xrpl = require('xrpl');

const senderWallet = xrpl.Wallet.fromSeed('sYourSenderSeed');
const destinationAddress = 'rReceiverAddress';
const amount = '100000000'; // 100 XRP in drops

const result = await createChannel(
  senderWallet,
  destinationAddress,
  amount,
  3600 // settle delay in seconds
);

console.log('Channel ID:', result.channelId);
```

### 2. Start a Streaming Session

**Sender side:**
```bash
curl -X POST http://localhost:3000/api/stream/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID",
    "walletSeed": "sYourSenderSeed",
    "ratePerSecond": "1000",
    "role": "sender"
  }'
```

**Receiver side:**
```bash
curl -X POST http://localhost:3000/api/stream/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID",
    "publicKey": "SENDER_PUBLIC_KEY",
    "role": "receiver"
  }'
```

### 3. Generate and Validate Claims

**Sender generates a claim:**
```bash
curl -X GET "http://localhost:3000/api/stream/claim?channelId=YOUR_CHANNEL_ID" \
  -H "Authorization: Bearer your-api-key"
```

**Receiver validates the claim:**
```bash
curl -X POST http://localhost:3000/api/stream/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID",
    "amount": "5000",
    "signature": "SIGNATURE_FROM_SENDER",
    "publicKey": "SENDER_PUBLIC_KEY"
  }'
```

### 4. Finalize on Chain

When ready to claim the XRP on-chain:

```bash
curl -X POST http://localhost:3000/api/stream/finalize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID",
    "receiverWalletSeed": "sYourReceiverSeed"
  }'
```

## 🔌 API Endpoints

### Stream Management

- `POST /api/stream/start` - Start streaming session
- `POST /api/stream/stop` - Stop streaming session
- `GET /api/stream/claim` - Generate signed claim (sender)
- `POST /api/stream/validate` - Validate claim (receiver)
- `POST /api/stream/finalize` - Finalize claim on-chain
- `GET /api/stream/status` - Get channel status
- `GET /api/stream/history` - Get claim history

### System

- `GET /health` - Health check
- `GET /` - API documentation

## 🔧 Configuration

Key configuration options in `config.js`:

```javascript
{
  channel: {
    DEFAULT_SETTLE_DELAY: 3600, // 1 hour
    MIN_CHANNEL_AMOUNT: '1000000', // 1 XRP
  },
  streaming: {
    DEFAULT_RATE_PER_SECOND: '1000', // 0.001 XRP/sec
    MAX_CLAIMS_PER_MINUTE: 60,
  },
  finalization: {
    minAmountToFinalize: '100000000', // 100 XRP
    maxTimeSinceLastFinalization: 3600000, // 1 hour
  }
}
```

## 🧪 Use Cases

1. **Video Streaming**: Pay per second of video content
2. **API Metering**: Pay for API calls in real-time
3. **IoT Micropayments**: Device-to-device micropayments
4. **Gaming**: In-game currency streaming
5. **Content Monetization**: Real-time payments for content consumption

## 🔐 Security Best Practices

1. **Never commit wallet seeds** to version control
2. **Use environment variables** for sensitive data
3. **Enable API key authentication** in production
4. **Use HTTPS** in production environments
5. **Implement rate limiting** to prevent abuse
6. **Regular channel monitoring** and finalization

## 📝 Development

Run tests:
```bash
npm test
```

Lint code:
```bash
npm run lint
```

## 🌐 XRPL Resources

- [XRPL Documentation](https://xrpl.org/)
- [Payment Channels Tutorial](https://xrpl.org/use-payment-channels.html)
- [XRPL Testnet Faucet](https://xrpl.org/xrp-testnet-faucet.html)
- [xrpl.js Library](https://js.xrpl.org/)

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## ⚠️ Disclaimer

This software is provided as-is for educational and development purposes. Always test thoroughly on testnet before deploying to mainnet. The authors are not responsible for any loss of funds.

