[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/olRbmSOr)

# DISCLAIMER:
This readme was AI generated with minimal human input barring corrections of content or additions to considerations.
The full breakdown of AI generated files and material is found at [AI-DISCLOSURE.md](AI_DISCLOSURE.md)

The frontend handles note generation, ZK proof creation, and transaction submission. The smart contract enforces all security invariants: fixed deposit amounts, nullifier-based double-spend prevention, Groth16 proof verification, and anti-front-running nonce binding. I have tried to be as clear as possible about what is and is not AI generated and all of my prompts have had this constraint in mind.

I am so short on time, frontend fully ai, deployment i needed help linking the contracts, script links them easily without requiring additional input. I remember the prompts i used but basically same as last assignment, follow rules, only wriote frontend etc. caviats im still using default rpc which gets rate limited quickly but is better than the alchemy one which restriucts to 10 block size. the rest of this is fully ai generated and looks ok but also im doing this with very little time so I apologize for any inconsistencies.

# Simple Crypto Mixer

A privacy-preserving crypto mixer dApp deployed on the Ethereum Sepolia testnet. Users deposit 0.1 ETH into a shared pool and later withdraw to a different address using a zero-knowledge proof, breaking the public link between deposit and withdrawal.

## Links

- **dApp:** https://cscd71.github.io/simple-crypto-mixer-rafik-h-1/
- **Smart Contract (Sepolia Etherscan):** [0x8015D3fD8b026ae8332c7547c18396c4AD117178](https://sepolia.etherscan.io/address/0x8015D3fD8b026ae8332c7547c18396c4AD117178)

---

## Setup & Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Foundry](https://getfoundry.sh/) (forge, anvil)
- [Circom](https://docs.circom.io/getting-started/installation/) (for circuit compilation, only needed if regenerating ZK artifacts)
- [MetaMask](https://metamask.io/) browser extension

### Clone and Install

```bash
git clone https://github.com/CSCD71/simple-crypto-mixer-rafik-h-1.git
cd simple-crypto-mixer-rafik-h-1

# Install Foundry dependencies (forge-std)
forge install

# Install root JS dependencies (snarkjs, viem, vitest, poseidon, merkle tree libs)
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

---

## Running Unit Tests

### Solidity Contract Tests (via Vitest + Anvil)

From the repo root:

```bash
# Start a local Anvil node in a separate terminal
anvil

# Run the tests
npm test
```

This runs `tests/Mixer.test.mjs` (core tests) and `tests/Mixer.ai.test.mjs` (AI-generated edge case tests) against a local Anvil instance. Tests use viem to deploy and interact with the contract, and snarkjs to generate ZK proofs.

The tests cover:
- Deposit event emission and Merkle tree root updates
- Full withdrawal flow with ZK proof verification
- Double-spend prevention via nullifier tracking
- Front-running resistance via nonce binding

---

## Deploying the Smart Contract to Sepolia

The mixer contract depends on three external libraries that must be deployed first: PoseidonT3, PoseidonT5, and IncrementalBinaryTree.

1. Create a `.env` file in the repo root:
   ```
   SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/{your-key}
   ACCOUNT_PRIVATE_KEY={your-private-key}
   ETHERSCAN_API_KEY={your-etherscan-key}
   ```

2. Source the env and deploy using `deploy.sh`:
   ```bash
   source .env
   bash deploy.sh
   ```

   The script deploys in order:
   1. PoseidonT3 library
   2. PoseidonT5 library
   3. IncrementalBinaryTree library (depends on PoseidonT3)
   4. ProofOfMembershipVerifier (Groth16 verifier)
   5. Mixer contract (constructor arg: verifier address)

   Library addresses are written to `foundry.toml` for compile-time linking.

3. If redeploying, update the contract address and deployment block in `frontend/src/lib/contracts/mixer.ts`.

### Note on deployment:
I would have liked to use the Foundry `Deploy.s.sol` script but couldn't get it to work with library linking in Forge 1.5.1. The `deploy.sh` script handles this by writing library addresses to `foundry.toml` before compiling dependent contracts.

---

## Running the Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. Connect MetaMask to Sepolia to interact with the mixer.

---

## Deploying the Frontend (GitHub Pages)

The frontend is a SvelteKit static site deployed to the `gh-pages` branch.

1. Ensure the repo is public and GitHub Pages is enabled (Settings > Pages > Deploy from branch > `gh-pages`).

2. Build and deploy:
   ```bash
   cd frontend
   npm run build
   npx gh-pages -d build -t
   ```
   The `-t` flag includes dotfiles (`.nojekyll`) so GitHub Pages serves the `_app/` directory correctly.

3. The site will be live at:
   ```
   https://cscd71.github.io/simple-crypto-mixer-rafik-h-1/
   ```

To redeploy after changes, run the same build and deploy command.

> **Note:** The `svelte.config.js` has the base path set to `/simple-crypto-mixer-rafik-h-1` for production. This is automatically cleared during `npm run dev` so local development works without the prefix. If the repo name changes, update this value in `svelte.config.js`.

---

## Design Choices & Caveats

### Smart Contract

- **Fixed deposit amount (0.1 ETH).** All deposits are the same size to ensure anonymity. If amounts varied, deposits and withdrawals could be correlated by amount.

- **Incremental Merkle tree (depth 20).** Commitments are stored in an on-chain Merkle tree supporting up to ~1 million deposits. The tree uses Poseidon hashing for zkSNARK compatibility.

- **Nullifier-based double-spend prevention.** Each deposit's nullifier is revealed publicly during withdrawal and stored in a `spentNullifiers` mapping. Replaying the same proof fails because the nullifier is already marked as spent.

- **Anti-front-running via nonce binding.** The `withdraw` function takes a random `nonce` which is hashed with `(chainId, contractAddress, recipient, nonce)` using Poseidon. This hash is verified inside the ZK proof, binding the proof to a specific recipient. An attacker who intercepts the transaction cannot redirect funds to a different address without generating a new valid proof.

- **Groth16 proof verification.** The contract uses a generated Solidity verifier that performs elliptic curve pairing checks. The verifier contract is auto-generated from the compiled circuit using snarkjs.

- **Checks-effects-interactions pattern.** The `spentNullifiers` mapping is updated before sending ETH to prevent reentrancy attacks.

### ZK Circuit

- **Circom circuit with Poseidon hashing.** The `ProofOfMembership` circuit (depth 20) proves knowledge of a secret and nullifier whose Poseidon hash exists as a leaf in the Merkle tree, without revealing which leaf.

- **Four public signals.** The proof exposes: Merkle root, auth hash, nullifier hash, and nonce. The secret and Merkle path remain private.

- **Auth hash for context binding.** `authHash = Poseidon(secret, nullifier, nonce)` binds the proof to the specific withdrawal context, preventing proof reuse across different recipients.

### Frontend

- **SvelteKit 5 with Svelte runes** (`$state`, `$derived`, `$effect`) for reactive state. Tailwind CSS v4 for styling. Viem as the Ethereum client library.

- **Client-side proof generation.** ZK proofs are generated entirely in the browser using snarkjs with the `.wasm` circuit and `.zkey` proving key served as static assets. No backend server is needed.

- **Note-based secret storage.** After depositing, the user receives a base64-encoded "note" containing the secret, nullifier, and commitment. This note can be copied or downloaded as a `.txt` file. The note is the only way to withdraw, there is no recovery if lost.

- **Transaction simulation before submission.** The withdrawal flow simulates the transaction via `simulateContract` before submitting to MetaMask. This catches revert reasons (e.g., "Proof verification failed", "Nullifier already spent") and shows them to the user before they pay gas.

- **Transaction receipt validation.** After submitting, the frontend waits for the receipt and checks `receipt.status` for on-chain reverts, preventing false success messages.

- **Default RPC (viem).** The frontend uses viem's built-in default RPC for Sepolia. No API key or custom RPC configuration is required.

---

## AI Disclosure

The frontend code and AI-generated edge case tests (`tests/Mixer.ai.test.mjs`) were written with AI assistance as permitted by the assignment policy. The Solidity smart contract (`contracts/Mixer.sol`) and core unit tests (`tests/Mixer.test.mjs`) were written entirely by hand.

See [AI_DISCLOSURE.md](AI_DISCLOSURE.md) for full details including which files were AI-generated.

---

## Project Structure

```
├── contracts/
│   ├── Mixer.sol                     # Smart contract (hand-written)
│   └── ProofOfMembershipVerifier.sol # Generated Groth16 verifier
├── circuits/
│   └── ProofOfMembership.circom      # ZK circuit (20-level Merkle tree)
├── tests/
│   ├── Mixer.test.mjs               # Core unit tests (hand-written)
│   └── Mixer.ai.test.mjs            # Edge case tests (AI-generated)
├── frontend/                         # AI-generated frontend
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/           # Svelte UI components
│   │   │   │   ├── WalletButton.svelte
│   │   │   │   ├── DepositForm.svelte
│   │   │   │   ├── WithdrawForm.svelte
│   │   │   │   └── NoteDisplay.svelte
│   │   │   ├── contracts/
│   │   │   │   └── mixer.ts          # Contract ABI and interaction helpers
│   │   │   └── utils/
│   │   │       ├── wallet.svelte.ts  # Wallet state management
│   │   │       ├── zk.ts            # ZK proof generation & note encoding
│   │   │       └── merkle.ts        # Merkle tree reconstruction
│   │   └── routes/
│   │       ├── +layout.svelte       # Root layout
│   │       ├── +layout.ts           # Prerender/SSR settings
│   │       └── +page.svelte         # Main page
│   ├── static/zk/                   # ZK artifacts (.wasm, .zkey)
│   └── svelte.config.js             # SvelteKit config (adapter-static)
├── zk-data/                          # ZK circuit artifacts (gitignored)
├── deploy.sh                         # Deployment script for Sepolia
├── foundry.toml                      # Foundry config (Solc 0.8.32)
├── package.json                      # Root dependencies
├── AI_DISCLOSURE.md                  # AI usage disclosure
└── HANDOUT.md                        # Assignment specification
```
