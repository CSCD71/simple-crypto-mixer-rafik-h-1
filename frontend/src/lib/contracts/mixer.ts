import {
	type Address,
	type PublicClient,
	type WalletClient,
	parseEther,
	parseAbi,
	type Hex
} from 'viem';

// ====================================================================
// PLACEHOLDER: Update this address after deploying the Mixer contract
// to Sepolia. The ABI below matches the contract exactly.
// ====================================================================

export const MIXER_CONTRACT_ADDRESS: Address =
	'0x8015D3fD8b026ae8332c7547c18396c4AD117178';

// Block number at which the contract was deployed. Update alongside the address
// to avoid querying the entire chain history for events.
export const DEPLOYMENT_BLOCK = 10509021n;

export const DEPOSIT_AMOUNT = parseEther('0.1');

// ABI matching the Mixer.sol contract
export const MIXER_ABI = parseAbi([
	'function deposit(uint256 commitment) payable',
	'function withdraw(bytes calldata proof, address payable to, uint256 nonce)',
	'function getHash(address payable to, uint256 nonce) view returns (uint256)',
	'event Deposit(uint256 indexed commitment, uint256 leafIndex, uint256 timestamp)'
]);

// Etherscan link for the deployed contract
export const ETHERSCAN_URL = `https://sepolia.etherscan.io/address/${MIXER_CONTRACT_ADDRESS}`;

/**
 * Calls deposit() on the Mixer contract with exactly 0.1 ETH.
 */
export async function deposit(
	commitment: bigint,
	walletClient: WalletClient
): Promise<Hex> {
	const [account] = await walletClient.getAddresses();
	const hash = await walletClient.writeContract({
		address: MIXER_CONTRACT_ADDRESS,
		abi: MIXER_ABI,
		functionName: 'deposit',
		args: [commitment],
		value: DEPOSIT_AMOUNT,
		account
	});
	return hash;
}

/**
 * Calls withdraw() on the Mixer contract.
 */
export async function withdraw(
	proof: Hex,
	to: Address,
	nonce: bigint,
	walletClient: WalletClient
): Promise<Hex> {
	const [account] = await walletClient.getAddresses();
	const hash = await walletClient.writeContract({
		address: MIXER_CONTRACT_ADDRESS,
		abi: MIXER_ABI,
		functionName: 'withdraw',
		args: [proof, to, nonce],
		account
	});
	return hash;
}

/**
 * Calls getHash() on the Mixer contract to compute the anti front running nonce.
 * This is PoseidonT5.hash([chainid, contractAddress, toAddress, nonce]).
 */
export async function getHash(
	to: Address,
	nonce: bigint,
	publicClient: PublicClient
): Promise<bigint> {
	const result = await publicClient.readContract({
		address: MIXER_CONTRACT_ADDRESS,
		abi: MIXER_ABI,
		functionName: 'getHash',
		args: [to, nonce]
	});
	return result as bigint;
}

/**
 * Reads all Deposit events from the Mixer contract to reconstruct
 * the commitment list (and thus the Merkle tree).
 */
export async function getDepositEvents(
	publicClient: PublicClient
): Promise<{ commitment: bigint; leafIndex: number }[]> {
	const logs = await publicClient.getContractEvents({
		address: MIXER_CONTRACT_ADDRESS,
		abi: MIXER_ABI,
		eventName: 'Deposit',
		fromBlock: DEPLOYMENT_BLOCK
	});

	return logs.map((log) => ({
		commitment: (log.args as { commitment: bigint }).commitment,
		leafIndex: Number((log.args as { leafIndex: number }).leafIndex)
	}));
}
