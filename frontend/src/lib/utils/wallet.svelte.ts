import {
	createWalletClient,
	createPublicClient,
	custom,
	http,
	type WalletClient,
	type PublicClient,
	type Address
} from 'viem';
import { sepolia } from 'viem/chains';

const activeChain = sepolia;

// ---- Reactive state using Svelte 5 runes ----

let address = $state<Address | null>(null);
let isConnected = $state(false);
let chainId = $state<number | null>(null);
let walletClient = $state<WalletClient | null>(null);
let isConnecting = $state(false);
let error = $state<string | null>(null);

const publicClient: PublicClient = createPublicClient({
	chain: activeChain,
	transport: http()
});

// ---- Derived state ----

const isWrongNetwork = $derived(chainId !== null && chainId !== activeChain.id);
const shortAddress = $derived(
	address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null
);

// ---- Actions ----

async function connect(): Promise<void> {
	if (typeof window === 'undefined' || !window.ethereum) {
		error = 'MetaMask is not installed. Please install MetaMask to continue.';
		return;
	}

	isConnecting = true;
	error = null;

	try {
		const client = createWalletClient({
			chain: activeChain,
			transport: custom(window.ethereum)
		});

		const addresses = await client.requestAddresses();
		const currentChainId = await client.getChainId();

		walletClient = client;
		address = addresses[0];
		chainId = currentChainId;
		isConnected = true;
	} catch (err) {
		error = err instanceof Error ? err.message : 'Failed to connect wallet';
	} finally {
		isConnecting = false;
	}
}

function disconnect(): void {
	address = null;
	isConnected = false;
	chainId = null;
	walletClient = null;
	error = null;
}

function handleAccountsChanged(accounts: unknown): void {
	const accs = accounts as string[];
	if (accs.length === 0) {
		disconnect();
	} else {
		address = accs[0] as Address;
	}
}

function handleChainChanged(newChainId: unknown): void {
	chainId = Number(newChainId);
}

function setupListeners(): void {
	if (typeof window === 'undefined' || !window.ethereum) return;
	window.ethereum.on('accountsChanged', handleAccountsChanged);
	window.ethereum.on('chainChanged', handleChainChanged);
}

function cleanupListeners(): void {
	if (typeof window === 'undefined' || !window.ethereum) return;
	window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
	window.ethereum.removeListener('chainChanged', handleChainChanged);
}

// ---- Exports ----

export const wallet = {
	get address() {
		return address;
	},
	get isConnected() {
		return isConnected;
	},
	get chainId() {
		return chainId;
	},
	get walletClient() {
		return walletClient;
	},
	get publicClient() {
		return publicClient;
	},
	get isConnecting() {
		return isConnecting;
	},
	get error() {
		return error;
	},
	get isWrongNetwork() {
		return isWrongNetwork;
	},
	get shortAddress() {
		return shortAddress;
	},
	connect,
	disconnect,
	setupListeners,
	cleanupListeners
};
