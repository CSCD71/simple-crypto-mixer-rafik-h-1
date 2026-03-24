import { poseidon2 } from 'poseidon-lite';
import { encodeAbiParameters } from 'viem';
import { base } from '$app/paths';

// Paths to the compiled circuit artifacts in static/zk/
const WASM_PATH = `${base}/zk/ProofOfMembership.wasm`;
const ZKEY_PATH = `${base}/zk/ProofOfMembership.zkey`;

/**
 * Generates a cryptographically random BigInt suitable for use as
 * a secret or nullifier. Uses crypto.getRandomValues for security.
 */
export function generateSecret(): bigint {
	const bytes = new Uint8Array(31); // 31 bytes < 254-bit BN254 field
	crypto.getRandomValues(bytes);
	return bytesToBigInt(bytes);
}

/**
 * Generates a cryptographically random nullifier.
 */
export function generateNullifier(): bigint {
	return generateSecret();
}

/**
 * Computes the Poseidon commitment hash.
 * commitment = Poseidon(secret, nullifier)
 */
export function computeCommitment(secret: bigint, nullifier: bigint): bigint {
	return poseidon2([secret, nullifier]);
}

/**
 * The note contains all information needed to withdraw.
 * It is base64-encoded JSON for easy copy/paste and file download.
 */
export interface MixerNote {
	secret: string; // BigInt as decimal string
	nullifier: string; // BigInt as decimal string
	commitment: string; // BigInt as decimal string
}

/**
 * Creates a note object from secret and nullifier.
 */
export function createNote(secret: bigint, nullifier: bigint): MixerNote {
	return {
		secret: secret.toString(),
		nullifier: nullifier.toString(),
		commitment: computeCommitment(secret, nullifier).toString()
	};
}

/**
 * Encodes a note to a base64 string for storage/sharing.
 */
export function encodeNote(note: MixerNote): string {
	const json = JSON.stringify(note);
	return btoa(json);
}

/**
 * Decodes a base64-encoded note string back to a MixerNote.
 * Throws if the string is invalid.
 */
export function decodeNote(encoded: string): MixerNote {
	try {
		const json = atob(encoded.trim());
		const parsed = JSON.parse(json);
		if (!parsed.secret || !parsed.nullifier || !parsed.commitment) {
			throw new Error('Invalid note format');
		}
		return parsed as MixerNote;
	} catch {
		throw new Error(
			'Failed to decode note. Make sure you pasted the complete note string.'
		);
	}
}

/**
 * Generates a ZK proof for the withdrawal.
 *
 * @param secret - The user's secret (private)
 * @param nullifier - The nullifier (public, prevents double-spend)
 * @param nonce - Anti-front-running nonce (the recipient address as uint256)
 * @param siblings - Merkle proof sibling hashes
 * @param pathIndices - Merkle proof path directions (0 = left, 1 = right)
 * @returns The proof and public signals
 */
export async function generateProof(
	secret: bigint,
	nullifier: bigint,
	nonce: bigint,
	siblings: bigint[],
	pathIndices: number[]
): Promise<{ proof: unknown; publicSignals: string[] }> {
	// Dynamic import to avoid SSR issues with snarkjs
	const snarkjs = await import('snarkjs');

	const input = {
		secret: secret.toString(),
		nullifier: nullifier.toString(),
		nonce: nonce.toString(),
		siblings: siblings.map((s) => s.toString()),
		pathIndices: pathIndices
	};

	const { proof, publicSignals } = await snarkjs.groth16.fullProve(
		input,
		WASM_PATH,
		ZKEY_PATH
	);

	return { proof, publicSignals };
}

/**
 * Formats the proof for the Solidity verifier contract.
 *
 * snarkjs.groth16.exportSolidityCallData returns a human-readable string:
 *   "[a0, a1],[[b00, b01],[b10, b11]],[c0, c1],[pub0, pub1, ...]"
 *
 * The Mixer contract expects `bytes calldata proof` which is ABI-encoded
 * (uint256[2], uint256[2][2], uint256[2], uint256[4]) matching the
 * abi.decode call in Mixer.sol withdraw().
 */
export async function formatProofForContract(
	proof: unknown,
	publicSignals: string[]
): Promise<`0x${string}`> {
	const snarkjs = await import('snarkjs');
	const calldata = await snarkjs.groth16.exportSolidityCallData(
		proof,
		publicSignals
	);

	// exportSolidityCallData returns: [a0,a1],[[b00,b01],[b10,b11]],[c0,c1],[pub0,pub1,...]
	// Parse it back into structured arrays matching the contract
	const calldataFormatted = JSON.parse('[' + calldata + ']');

	return encodeAbiParameters(
		[
			{ type: 'uint256[2]' },
			{ type: 'uint256[2][2]' },
			{ type: 'uint256[2]' },
			{ type: 'uint256[4]' }
		],
		calldataFormatted
	);
}

// ---- Internal helpers ----

function bytesToBigInt(bytes: Uint8Array): bigint {
	let result = 0n;
	for (let i = 0; i < bytes.length; i++) {
		result = (result << 8n) | BigInt(bytes[i]);
	}
	return result;
}
