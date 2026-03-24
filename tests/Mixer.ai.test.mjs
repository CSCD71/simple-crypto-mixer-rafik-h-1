import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, describe, it, beforeAll } from "vitest";

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  encodeAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

import { proxy, PoseidonT3, PoseidonT5 } from "poseidon-solidity";

import { randomBytes } from "@noble/ciphers/webcrypto";
import { poseidon2, poseidon4 } from "poseidon-lite";

import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree";

import { groth16 } from "snarkjs";

/**
 * AI-generated edge-case tests for the Mixer contract.
 * These supplement the main Mixer.test.mjs test suite — no duplicated scenarios.
 * Uses Anvil accounts 5-9 to avoid collisions with the main test file (accounts 0-4).
 */

const wasmFile = join("zk-data", "ProofOfMembership_js", "ProofOfMembership.wasm");
const zkeyFile = join("zk-data", "ProofOfMembership.zkey");
const vKey = JSON.parse(readFileSync(join("zk-data", "ProofOfMembership.vkey")));

const rpc = http("http://127.0.0.1:8545");
const client = createPublicClient({ chain: foundry, transport: rpc });

const privateKeys = [
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
    "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
    "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
    "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
];

const p = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

function randomBigInt32ModP() {
    const bytes = randomBytes(32);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return BigInt("0x" + hex) % p;
}

function poseidonHash(childNodes) {
    return poseidon2(childNodes);
}

function loadContract(contract, libraries = {}) {
    const content = readFileSync(join("out", `${contract}.sol`, `${contract}.json`), "utf8");
    const artifact = JSON.parse(content);
    const abi = artifact.abi;
    let bytecode = artifact.bytecode.object;
    const substitutions = {};
    const references = Object.assign({}, ...Object.values(artifact.bytecode.linkReferences));
    for (let reference in references) {
        if (!(reference in libraries)) throw new Error(`Undefined address for library ${reference}`);
        const instance = references[reference][0];
        const from = instance.start * 2 + 2;
        const to = from + instance.length * 2;
        const placeholder = bytecode.slice(from, to);
        substitutions[placeholder] = libraries[reference].slice(2).toLowerCase();
    }
    for (let substitution in substitutions) {
        bytecode = bytecode.replaceAll(substitution, substitutions[substitution]);
    }
    return { abi, bytecode };
}

/** Generates a proof and returns the ABI-encoded calldata ready for the contract. */
async function makeProof(secret, nullifier, jsTree, contractAddress, toAddress, nonce) {
    const commitment = poseidon2([secret, nullifier]);
    const leafIndex = jsTree.indexOf(commitment);
    const merkleProof = jsTree.createProof(leafIndex);
    const siblings = merkleProof.siblings.map(s => Array.isArray(s) ? s[0] : s);
    const pathIndices = merkleProof.pathIndices;

    const zkNonce = poseidon4([BigInt(foundry.id), BigInt(contractAddress), BigInt(toAddress), nonce]);

    const { proof, publicSignals } = await groth16.fullProve(
        {
            secret: secret.toString(),
            nullifier: nullifier.toString(),
            nonce: zkNonce.toString(),
            siblings: siblings.map(s => s.toString()),
            pathIndices,
        },
        wasmFile,
        zkeyFile,
    );

    const calldata = await groth16.exportSolidityCallData(proof, publicSignals);
    const formatted = JSON.parse("[" + calldata + "]");
    const encoded = encodeAbiParameters(
        [
            { type: "uint256[2]" },
            { type: "uint256[2][2]" },
            { type: "uint256[2]" },
            { type: "uint256[4]" },
        ],
        formatted,
    );

    return { encoded, proof, publicSignals };
}

const TREE_DEPTH = 20;
const DEPOSIT_AMOUNT = parseEther("0.1");

describe("Mixer edge cases", () => {
    let deployer, userA, userB, userC, userD;
    let contract;
    let jsTree;

    beforeAll(async () => {
        [deployer, userA, userB, userC, userD] = await Promise.all(
            privateKeys.map(pk =>
                createWalletClient({ chain: foundry, transport: rpc, account: privateKeyToAccount(pk) })
            )
        );

        // Deploy Poseidon libraries if they are not already deployed.
        const t3Code = await client.getBytecode({ address: PoseidonT3.address });
        if (!t3Code) {
            const h = await deployer.sendTransaction({ to: proxy.address, data: PoseidonT3.data });
            await client.waitForTransactionReceipt({ hash: h });
        }
        const t5Code = await client.getBytecode({ address: PoseidonT5.address });
        if (!t5Code) {
            const h = await deployer.sendTransaction({ to: proxy.address, data: PoseidonT5.data });
            await client.waitForTransactionReceipt({ hash: h });
        }

        // Deploy the IncrementalBinaryTree library.
        const ibtArtifact = loadContract("IncrementalBinaryTree", { PoseidonT3: PoseidonT3.address });
        const ibtHash = await deployer.deployContract(ibtArtifact);
        const ibtReceipt = await client.waitForTransactionReceipt({ hash: ibtHash });
        const ibtAddress = ibtReceipt.contractAddress;

        // Deploy the verifier contract.
        const vArtifact = loadContract("ProofOfMembershipVerifier");
        const vHash = await deployer.deployContract(vArtifact);
        const vReceipt = await client.waitForTransactionReceipt({ hash: vHash });

        // Deploy the Mixer contract.
        const mixerArtifact = loadContract("Mixer", {
            IncrementalBinaryTree: ibtAddress,
            PoseidonT5: PoseidonT5.address,
        });
        const mHash = await deployer.deployContract({
            abi: mixerArtifact.abi,
            bytecode: mixerArtifact.bytecode,
            args: [vReceipt.contractAddress],
        });
        const mReceipt = await client.waitForTransactionReceipt({ hash: mHash });
        contract = { address: mReceipt.contractAddress, abi: mixerArtifact.abi };

        jsTree = new IncrementalMerkleTree(poseidonHash, TREE_DEPTH, 0n, 2);
    });


    describe("deposit edge cases", () => {

        // Sending zero ETH should be rejected because the contract requires exactly 0.1 ETH.
        it("should reject deposit with zero value", async () => {
            await expect(
                userA.writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "deposit",
                    args: [randomBigInt32ModP()],
                    value: 0n,
                })
            ).rejects.toThrow("deposit must be exactly 0.1 ether");
        });

        // Sending less than 0.1 ETH should be rejected.
        it("should reject deposit with wrong amount (too low)", async () => {
            await expect(
                userA.writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "deposit",
                    args: [randomBigInt32ModP()],
                    value: parseEther("0.05"),
                })
            ).rejects.toThrow("deposit must be exactly 0.1 ether");
        });

        // Sending more than 0.1 ETH should be rejected.
        it("should reject deposit with wrong amount (too high)", async () => {
            await expect(
                userA.writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "deposit",
                    args: [randomBigInt32ModP()],
                    value: parseEther("0.2"),
                })
            ).rejects.toThrow("deposit must be exactly 0.1 ether");
        });

        // Multiple deposits from different users should produce sequential leaf indices,
        // and the on-chain tree root should match the JavaScript tree after all insertions.
        it("should handle multiple deposits from different users with correct leaf indices", async () => {
            const secrets = [];
            const users = [userA, userB, userC];

            for (let i = 0; i < users.length; i++) {
                const secret = randomBigInt32ModP();
                const nullifier = randomBigInt32ModP();
                const commitment = poseidon2([secret, nullifier]);
                secrets.push({ secret, nullifier, commitment });

                const hash = await users[i].writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "deposit",
                    args: [commitment],
                    value: DEPOSIT_AMOUNT,
                });
                await client.waitForTransactionReceipt({ hash });
                jsTree.insert(commitment);
            }

            // Check that the on-chain root matches the JavaScript tree.
            const onChainRoot = await client.readContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "tree",
            });
            expect(onChainRoot[1]).to.equal(jsTree.root);
        });

        // The same commitment can be deposited twice because the contract does not enforce
        // uniqueness. Each deposit creates a separate leaf in the tree.
        it("should allow depositing the same commitment value twice", async () => {
            const secret = randomBigInt32ModP();
            const nullifier = randomBigInt32ModP();
            const commitment = poseidon2([secret, nullifier]);

            // First deposit.
            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            // Second deposit with the same commitment.
            hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            const receipt = await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            expect(receipt.status).to.equal("success");
        });
    });


    describe("withdraw edge cases", () => {

        // A different account than the depositor should be able to withdraw,
        // as long as they know the secret and nullifier.
        it("should allow a different account than the depositor to withdraw", async () => {
            const secret = randomBigInt32ModP();
            const nullifier = randomBigInt32ModP();
            const commitment = poseidon2([secret, nullifier]);

            // User A deposits.
            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            // User B withdraws using a completely different account.
            const nonce = randomBigInt32ModP();
            const { encoded } = await makeProof(
                secret, nullifier, jsTree, contract.address, userB.account.address, nonce,
            );

            const balanceBefore = await client.getBalance({ address: userB.account.address });

            hash = await userB.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "withdraw",
                args: [encoded, userB.account.address, nonce],
            });
            const receipt = await client.waitForTransactionReceipt({ hash });

            const balanceAfter = await client.getBalance({ address: userB.account.address });
            const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
            expect(balanceAfter - balanceBefore + gasCost).to.equal(DEPOSIT_AMOUNT);
        });

        // Submitting garbage bytes as a proof should fail verification.
        // The verifier's static call returns false for invalid proof data.
        it("should reject withdrawal with an invalid/garbage proof", async () => {
            // A valid deposit is needed in the tree for a valid root, but the proof itself is junk.
            const secret = randomBigInt32ModP();
            const nullifier = randomBigInt32ModP();
            const commitment = poseidon2([secret, nullifier]);

            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            // Construct a fake proof with all zeros.
            const fakeProof = encodeAbiParameters(
                [
                    { type: "uint256[2]" },
                    { type: "uint256[2][2]" },
                    { type: "uint256[2]" },
                    { type: "uint256[4]" },
                ],
                [
                    [0n, 0n],
                    [[0n, 0n], [0n, 0n]],
                    [0n, 0n],
                    [0n, 0n, 0n, 0n],
                ],
            );

            const nonce = randomBigInt32ModP();
            await expect(
                userB.writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "withdraw",
                    args: [fakeProof, userB.account.address, nonce],
                })
            ).rejects.toThrow();
        });

        // Two deposits with different commitments should allow two separate withdrawals.
        // Each deposit adds 0.1 ETH and each withdrawal removes 0.1 ETH.
        it("should allow two withdrawals when two deposits were made", async () => {
            const secret1 = randomBigInt32ModP();
            const nullifier1 = randomBigInt32ModP();
            const commitment1 = poseidon2([secret1, nullifier1]);

            let hash = await userC.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment1],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment1);

            // Second deposit with a different commitment from the same user.
            const secret2 = randomBigInt32ModP();
            const nullifier2 = randomBigInt32ModP();
            const commitment2 = poseidon2([secret2, nullifier2]);

            hash = await userC.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment2],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment2);

            // Withdraw the first deposit.
            const nonce1 = randomBigInt32ModP();
            const proof1 = await makeProof(
                secret1, nullifier1, jsTree, contract.address, userD.account.address, nonce1,
            );

            hash = await userD.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "withdraw",
                args: [proof1.encoded, userD.account.address, nonce1],
            });
            await client.waitForTransactionReceipt({ hash });

            // Withdraw the second deposit. This should also succeed because two deposits were made.
            const nonce2 = randomBigInt32ModP();
            const proof2 = await makeProof(
                secret2, nullifier2, jsTree, contract.address, userD.account.address, nonce2,
            );

            hash = await userD.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "withdraw",
                args: [proof2.encoded, userD.account.address, nonce2],
            });
            const receipt = await client.waitForTransactionReceipt({ hash });
            expect(receipt.status).to.equal("success");
        });

        // Withdrawal should work correctly even when the tree has many leaves.
        // This test verifies that the Merkle proof works with a populated tree, not just one or two leaves.
        it("should successfully withdraw after multiple deposits from various users", async () => {
            // Add several deposits to grow the tree.
            const targetSecret = randomBigInt32ModP();
            const targetNullifier = randomBigInt32ModP();
            const targetCommitment = poseidon2([targetSecret, targetNullifier]);

            // Deposit three dummy commitments first.
            for (let i = 0; i < 3; i++) {
                const s = randomBigInt32ModP();
                const n = randomBigInt32ModP();
                const c = poseidon2([s, n]);
                const h = await userA.writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "deposit",
                    args: [c],
                    value: DEPOSIT_AMOUNT,
                });
                await client.waitForTransactionReceipt({ hash: h });
                jsTree.insert(c);
            }

            // Deposit the target commitment.
            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [targetCommitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(targetCommitment);

            // Deposit two more dummy commitments after the target.
            for (let i = 0; i < 2; i++) {
                const s = randomBigInt32ModP();
                const n = randomBigInt32ModP();
                const c = poseidon2([s, n]);
                const h = await userB.writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "deposit",
                    args: [c],
                    value: DEPOSIT_AMOUNT,
                });
                await client.waitForTransactionReceipt({ hash: h });
                jsTree.insert(c);
            }

            // Withdraw the target commitment from the middle of the tree.
            const nonce = randomBigInt32ModP();
            const { encoded } = await makeProof(
                targetSecret, targetNullifier, jsTree, contract.address, userC.account.address, nonce,
            );

            hash = await userC.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "withdraw",
                args: [encoded, userC.account.address, nonce],
            });
            const receipt = await client.waitForTransactionReceipt({ hash });
            expect(receipt.status).to.equal("success");
        });

        // The spentNullifiers mapping should be updated after a withdrawal.
        // This test reads the public mapping directly to verify the nullifier is marked as spent.
        it("should mark nullifier as spent in the public mapping after withdrawal", async () => {
            const secret = randomBigInt32ModP();
            const nullifier = randomBigInt32ModP();
            const commitment = poseidon2([secret, nullifier]);

            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            // Check that the nullifier is not spent before withdrawal.
            const spentBefore = await client.readContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "spentNullifiers",
                args: [nullifier],
            });
            expect(spentBefore).to.equal(false);

            // Perform the withdrawal.
            const nonce = randomBigInt32ModP();
            const { encoded } = await makeProof(
                secret, nullifier, jsTree, contract.address, userB.account.address, nonce,
            );

            hash = await userB.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "withdraw",
                args: [encoded, userB.account.address, nonce],
            });
            await client.waitForTransactionReceipt({ hash });

            // Check that the nullifier is now spent.
            const spentAfter = await client.readContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "spentNullifiers",
                args: [nullifier],
            });
            expect(spentAfter).to.equal(true);
        });

        // An attacker who intercepts the proof and submits it with the correct recipient
        // address but a different nonce should be rejected because the nonce is embedded
        // in the proof via the zkNonce hash.
        it("should reject withdrawal with correct address but wrong nonce", async () => {
            const secret = randomBigInt32ModP();
            const nullifier = randomBigInt32ModP();
            const commitment = poseidon2([secret, nullifier]);

            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            const nonce = randomBigInt32ModP();
            const { encoded } = await makeProof(
                secret, nullifier, jsTree, contract.address, userB.account.address, nonce,
            );

            // Submit with a different nonce than the one the proof was generated with.
            const wrongNonce = randomBigInt32ModP();
            await expect(
                userB.writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "withdraw",
                    args: [encoded, userB.account.address, wrongNonce],
                })
            ).rejects.toThrow("Nonce does not match");
        });

        // A proof becomes invalid if a new deposit changes the Merkle root after the proof
        // was generated. The contract requires the proof's root to match the current on-chain root.
        it("should reject withdrawal with a stale Merkle root", async () => {
            const secret = randomBigInt32ModP();
            const nullifier = randomBigInt32ModP();
            const commitment = poseidon2([secret, nullifier]);

            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            // Generate the proof against the current tree state.
            const nonce = randomBigInt32ModP();
            const { encoded } = await makeProof(
                secret, nullifier, jsTree, contract.address, userB.account.address, nonce,
            );

            // A new deposit changes the on-chain Merkle root, making the proof stale.
            const dummyCommitment = poseidon2([randomBigInt32ModP(), randomBigInt32ModP()]);
            hash = await userC.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [dummyCommitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(dummyCommitment);

            // The proof should now be rejected because its root no longer matches.
            await expect(
                userB.writeContract({
                    address: contract.address,
                    abi: contract.abi,
                    functionName: "withdraw",
                    args: [encoded, userB.account.address, nonce],
                })
            ).rejects.toThrow("Merkle root does not match");
        });

        // A third-party relayer (msg.sender != to) should be able to submit the withdrawal
        // transaction on behalf of the intended recipient. The funds go to the "to" address,
        // not to msg.sender.
        it("should allow a third-party relayer to submit a withdrawal on behalf of the recipient", async () => {
            const secret = randomBigInt32ModP();
            const nullifier = randomBigInt32ModP();
            const commitment = poseidon2([secret, nullifier]);

            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            // The proof targets userB as the recipient.
            const nonce = randomBigInt32ModP();
            const { encoded } = await makeProof(
                secret, nullifier, jsTree, contract.address, userB.account.address, nonce,
            );

            const balanceBefore = await client.getBalance({ address: userB.account.address });

            // userC submits the transaction (acting as a relayer), but funds go to userB.
            hash = await userC.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "withdraw",
                args: [encoded, userB.account.address, nonce],
            });
            const receipt = await client.waitForTransactionReceipt({ hash });

            const balanceAfter = await client.getBalance({ address: userB.account.address });
            // userB's balance should increase by exactly the deposit amount (no gas cost for userB).
            expect(balanceAfter - balanceBefore).to.equal(DEPOSIT_AMOUNT);
            expect(receipt.status).to.equal("success");
        });

        // The Withdrawal event should include the correct recipient address and nullifier value.
        it("should emit a Withdrawal event with the correct nullifier", async () => {
            const secret = randomBigInt32ModP();
            const nullifier = randomBigInt32ModP();
            const commitment = poseidon2([secret, nullifier]);

            let hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            const nonce = randomBigInt32ModP();
            const { encoded } = await makeProof(
                secret, nullifier, jsTree, contract.address, userB.account.address, nonce,
            );

            hash = await userB.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "withdraw",
                args: [encoded, userB.account.address, nonce],
            });
            await client.waitForTransactionReceipt({ hash });

            const logs = await client.getContractEvents({
                address: contract.address,
                abi: contract.abi,
                eventName: "Withdrawal",
                fromBlock: 0n,
            });
            const lastLog = logs[logs.length - 1];
            expect(lastLog.args.to.toLowerCase()).to.equal(userB.account.address.toLowerCase());
            expect(lastLog.args.nullifier).to.equal(nullifier);
        });

        // The Deposit event should include a non-zero timestamp.
        it("should emit a Deposit event with a non-zero timestamp", async () => {
            const commitment = poseidon2([randomBigInt32ModP(), randomBigInt32ModP()]);

            const hash = await userA.writeContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "deposit",
                args: [commitment],
                value: DEPOSIT_AMOUNT,
            });
            await client.waitForTransactionReceipt({ hash });
            jsTree.insert(commitment);

            const logs = await client.getContractEvents({
                address: contract.address,
                abi: contract.abi,
                eventName: "Deposit",
                fromBlock: 0n,
            });
            const lastLog = logs[logs.length - 1];
            expect(lastLog.args.commitment).to.equal(commitment);
            expect(lastLog.args.timestamp).toBeGreaterThan(0n);
        });
    });


    describe("public state", () => {

        // The spentNullifiers mapping should return false for a nullifier that has never been used.
        it("should return false for an unspent nullifier", async () => {
            const result = await client.readContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "spentNullifiers",
                args: [randomBigInt32ModP()],
            });
            expect(result).to.equal(false);
        });

        // The tree() getter should return the correct depth after initialization.
        it("should have tree depth of 20 after initialization", async () => {
            const treeData = await client.readContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "tree",
            });
            // The treeData tuple is [depth, root, numberOfLeaves].
            expect(treeData[0]).to.equal(20n);
        });

        // The numberOfLeaves field in the tree should reflect the total number of deposits made.
        it("should track the correct number of leaves after deposits", async () => {
            const treeData = await client.readContract({
                address: contract.address,
                abi: contract.abi,
                functionName: "tree",
            });
            // The number of on-chain leaves should match the JavaScript tree.
            expect(treeData[2]).to.equal(BigInt(jsTree.leaves.length));
        });
    });
});
