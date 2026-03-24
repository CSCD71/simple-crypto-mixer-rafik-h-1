# AI Disclosure

The following files were generated with AI assistance (Claude) and may have been
subsequently modified. The author fully understands and can explain all code contained
in these files.

All front end is ai, test file that is makrked as ai is ai, deployment script was ai generated with guidnace as to what needs to be linked.

## Frontend Files (AI-Generated)

### Configuration

- `frontend/vite.config.ts` - Vite configuration with TailwindCSS v4 and SvelteKit
- `frontend/src/app.css` - TailwindCSS v4 global styles and custom theme
- `frontend/src/app.d.ts` - TypeScript ambient declarations (window.ethereum)

### Library / Utilities

- `frontend/src/lib/contracts/mixer.ts` - Contract ABI, address, and interaction helpers
- `frontend/src/lib/utils/wallet.svelte.ts` - Wallet state management with Svelte 5 runes
- `frontend/src/lib/utils/zk.ts` - ZK proof generation, Poseidon hashing, note encoding
- `frontend/src/lib/utils/merkle.ts` - Merkle tree reconstruction and proof extraction

### Components

- `frontend/src/lib/components/WalletButton.svelte` - MetaMask connect/disconnect button
- `frontend/src/lib/components/NoteDisplay.svelte` - Private note display with copy/download
- `frontend/src/lib/components/DepositForm.svelte` - Deposit flow UI
- `frontend/src/lib/components/WithdrawForm.svelte` - Withdrawal flow UI

### Routes

- `frontend/src/routes/+layout.svelte` - Root layout with navigation and footer
- `frontend/src/routes/+page.svelte` - Main page with deposit/withdraw forms

## Note

The Solidity smart contract and core unit tests are NOT AI-generated.
