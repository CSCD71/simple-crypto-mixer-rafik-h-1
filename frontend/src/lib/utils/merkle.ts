import { IncrementalMerkleTree } from '@zk-kit/incremental-merkle-tree';
import { poseidon2 } from 'poseidon-lite';

// Must match the circuit's tree depth
const TREE_DEPTH = 20;

// Zero value for empty leaves (must match the contract's zero value)
const ZERO_VALUE = BigInt(0);

/**
 * Hash function adapter for the Merkle tree library.
 * Poseidon2 takes exactly 2 inputs (binary tree children).
 */
function poseidonHash(childNodes: bigint[]): bigint {
	return poseidon2(childNodes);
}

/**
 * Reconstructs the Merkle tree from a list of commitments.
 * Commitments must be in insertion order (matching on-chain order).
 */
export function reconstructTree(commitments: bigint[]): IncrementalMerkleTree {
	const tree = new IncrementalMerkleTree(poseidonHash, TREE_DEPTH, ZERO_VALUE, 2);

	for (const commitment of commitments) {
		tree.insert(commitment);
	}

	return tree;
}

/**
 * Gets the Merkle proof for a specific leaf (commitment) in the tree.
 * Returns the siblings and path indices needed for the ZK circuit.
 */
export function getMerkleProof(
	tree: IncrementalMerkleTree,
	leafIndex: number
): { siblings: bigint[]; pathIndices: number[]; root: bigint } {
	const proof = tree.createProof(leafIndex);

	// The proof.siblings from @zk-kit/incremental-merkle-tree is an array
	// of arrays (one sibling per level). Flatten to get the single sibling
	// at each level.
	const siblings: bigint[] = proof.siblings.map((level: bigint | bigint[]) =>
		Array.isArray(level) ? level[0] : level
	);

	return {
		siblings,
		pathIndices: proof.pathIndices,
		root: proof.root
	};
}

/**
 * Finds the index of a commitment in a list of commitments.
 * Returns -1 if not found.
 */
export function findCommitmentIndex(
	commitments: bigint[],
	commitment: bigint
): number {
	return commitments.findIndex((c) => c === commitment);
}

export { TREE_DEPTH, ZERO_VALUE };
