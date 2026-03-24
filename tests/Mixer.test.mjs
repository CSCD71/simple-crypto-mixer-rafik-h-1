import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, describe, it, beforeAll, afterAll } from "vitest";

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

import { proxy, PoseidonT3, PoseidonT5 } from "poseidon-solidity";

import { randomBytes } from "@noble/ciphers/webcrypto";
import { poseidon2, poseidon4 } from "poseidon-lite";

import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree";

import { groth16 } from "snarkjs";

let wasmFile = join(
  "zk-data",
  "ProofOfMembership_js",
  "ProofOfMembership.wasm",
);
let zkeyFile = join("zk-data", "ProofOfMembership.zkey");
const vKey = JSON.parse(
  readFileSync(join("zk-data", "ProofOfMembership.vkey")),
);

const rpc = http("http://127.0.0.1:8545");
const client = createPublicClient({ chain: foundry, transport: rpc });

const privateKeys = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];

// NOTE: linter run, specifically prettier
// Based much of the setup off of PasswordWallet.test.mjs + my exchange tests from assignment2
function loadContract(contract, libraries = {}) {
  const content = readFileSync(
    join("out", `${contract}.sol`, `${contract}.json`),
    "utf8",
  );
  const artifact = JSON.parse(content);
  const abi = artifact.abi;
  let bytecode = artifact.bytecode.object;
  const substitutions = {};
  const references = Object.assign(
    {},
    ...Object.values(artifact.bytecode.linkReferences),
  );
  for (let reference in references) {
    if (!(reference in libraries))
      throw new Error(`Undefined address for library ${reference}`);
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

const p = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

function randomBigInt32ModP() {
  const bytes = randomBytes(32);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return BigInt("0x" + hex) % p;
}

const TREE_DEPTH = 20;
const ZERO_VALUE = 0n;
const DEPOSIT_AMOUNT = parseEther("0.1");

describe("Mixer", function () {
  let deployer, depositor, withdrawer, attacker; // wallets
  let contract;
  // state tracking tree
  let jsTree;

  const receipts = [];

  afterAll(async () => {
    if (receipts.length === 0) return;

    console.log("\n=== Gas / ETH cost summary ===");

    for (const { label, receipt } of receipts) {
      const costWei = receipt.gasUsed * receipt.effectiveGasPrice;
      console.log(
        `• ${label}\n  gas: ${receipt.gasUsed} | cost: ${formatEther(costWei)} ETH`,
      );
    }
    console.log("================================\n");
  });

  beforeAll(async () => {
    // Create Accounts
    [deployer, depositor, withdrawer, attacker] = await Promise.all(
      privateKeys.map(function (pk) {
        return createWalletClient({
          chain: foundry,
          transport: rpc,
          account: privateKeyToAccount(pk),
        });
      }),
    );

    const hasherT3Code = await client.getBytecode({
      address: PoseidonT3.address,
    });
    if (!hasherT3Code) {
      const pHash = await deployer.sendTransaction({
        to: proxy.address,
        data: PoseidonT3.data,
      });
      await client.waitForTransactionReceipt({ hash: pHash });
    }

    const hasherT5Code = await client.getBytecode({
      address: PoseidonT5.address,
    });
    if (!hasherT5Code) {
      const pHash = await deployer.sendTransaction({
        to: proxy.address,
        data: PoseidonT5.data,
      });
      await client.waitForTransactionReceipt({ hash: pHash });
    }

    const treeArtifact = loadContract("IncrementalBinaryTree", {
      PoseidonT3: PoseidonT3.address,
    });
    const treeHash = await deployer.deployContract(treeArtifact);
    const treeReceipt = await client.waitForTransactionReceipt({
      hash: treeHash,
    });
    receipts.push({
      label: "Deploy IncrementalBinaryTree",
      receipt: treeReceipt,
    });
    const treeAddress = treeReceipt.contractAddress;

    // Deploy Verifier
    const hash = await deployer.deployContract(
      loadContract("ProofOfMembershipVerifier"),
    );
    const receipt = await client.waitForTransactionReceipt({ hash });
    receipts.push({ label: "Deploy Verifier", receipt });
    const verifierAddress = receipt.contractAddress;

    const { abi, bytecode } = loadContract("Mixer", {
      IncrementalBinaryTree: treeAddress,
      PoseidonT5: PoseidonT5.address,
    });
    const hash2 = await deployer.deployContract({
      abi,
      bytecode,
      args: [verifierAddress],
    });
    const receipt2 = await client.waitForTransactionReceipt({ hash: hash2 });
    receipts.push({ label: "Deploy Mixer", receipt: receipt2 });
    contract = { address: receipt2.contractAddress, abi };

    jsTree = new IncrementalMerkleTree(poseidon2, TREE_DEPTH, ZERO_VALUE, 2);
  });

  describe("Deposit", function () {
    let secret, nullifier, commitment;

    beforeAll(async () => {
      secret = randomBigInt32ModP();
      nullifier = randomBigInt32ModP();
      commitment = poseidon2([secret, nullifier]);

      const hash = await depositor.writeContract({
        ...contract,
        functionName: "deposit",
        args: [commitment],
        value: DEPOSIT_AMOUNT,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      receipts.push({ label: "Deposit", receipt });

      // mirror in js tree
      jsTree.insert(commitment);
    });

    it("should emit deposit event with correct fields", async function () {
      const logs = await client.getContractEvents({
        ...contract,
        eventName: "Deposit",
        fromBlock: 0n,
      });
      expect(logs.length).toBeGreaterThan(0);
      const lastLog = logs[logs.length - 1];
      expect(lastLog.args.commitment).to.equal(commitment);
      expect(lastLog.args.leafIndex).to.equal(0n);
    });

    it("should update merkle tree root after deposit", async function () {
      const onChainRoot = await client.readContract({
        ...contract,
        functionName: "tree",
      });
      // tree() geter returns (depth, root, numberOfLeaves)
      expect(onChainRoot[1]).to.equal(jsTree.root);
    });
  });

  describe("Withdraw", function () {
    let secret, nullifier, commitment;
    let proofEncoded, nonce;

    beforeAll(async () => {
      // fresh deposit for withdrawal testing
      secret = randomBigInt32ModP();
      nullifier = randomBigInt32ModP();
      commitment = poseidon2([secret, nullifier]);

      const hash = await depositor.writeContract({
        ...contract,
        functionName: "deposit",
        args: [commitment],
        value: DEPOSIT_AMOUNT,
      });
      await client.waitForTransactionReceipt({ hash });
      jsTree.insert(commitment);

      // merkle proof for this leaf
      const leafIndex = jsTree.indexOf(commitment);
      const merkleProof = jsTree.createProof(leafIndex);
      const siblings = merkleProof.siblings.map(function (s) {
        return Array.isArray(s) ? s[0] : s;
      });
      const pathIndices = merkleProof.pathIndices;

      nonce = randomBigInt32ModP();
      const to = withdrawer.account.address;
      const zkNonce = poseidon4([
        BigInt(foundry.id),
        BigInt(contract.address),
        BigInt(to),
        nonce,
      ]);

      const { proof, publicSignals } = await groth16.fullProve(
        {
          secret: secret.toString(),
          nullifier: nullifier.toString(),
          nonce: zkNonce.toString(),
          siblings: siblings.map(function (s) {
            return s.toString();
          }),
          pathIndices: pathIndices,
        },
        wasmFile,
        zkeyFile,
      );

      const res = await groth16.verify(vKey, publicSignals, proof);
      expect(res).to.be.true;
      const proofCalldata = await groth16.exportSolidityCallData(
        proof,
        publicSignals,
      );
      const proofCalldataFormatted = JSON.parse("[" + proofCalldata + "]");
      proofEncoded = encodeAbiParameters(
        [
          { type: "uint256[2]" },
          { type: "uint256[2][2]" },
          { type: "uint256[2]" },
          { type: "uint256[4]" },
        ],
        proofCalldataFormatted,
      );
    });

    it("should verify the proof locally", async function () {
      expect(proofEncoded).toBeDefined();
    });

    it("should withdraw 0.1 ETH to recipient", async function () {
      const balanceBefore = await client.getBalance({
        address: withdrawer.account.address,
      });

      const hash = await withdrawer.writeContract({
        ...contract,
        functionName: "withdraw",
        args: [proofEncoded, withdrawer.account.address, nonce],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      receipts.push({ label: "Withdraw", receipt });

      const balanceAfter = await client.getBalance({
        address: withdrawer.account.address,
      });
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
      expect(balanceAfter - balanceBefore + gasCost).to.equal(DEPOSIT_AMOUNT);
    });

    it("should emit withdrawal event with correct fields", async function () {
      const logs = await client.getContractEvents({
        ...contract,
        eventName: "Withdrawal",
        fromBlock: 0n,
      });
      expect(logs.length).toBeGreaterThan(0);
      const lastLog = logs[logs.length - 1];
      expect(lastLog.args.to.toLowerCase()).to.equal(
        withdrawer.account.address.toLowerCase(),
      );
    });

    it("should reject double withdrawal with same nullifier", async function () {
      await expect(
        withdrawer.writeContract({
          ...contract,
          functionName: "withdraw",
          args: [proofEncoded, withdrawer.account.address, nonce],
        }),
      ).rejects.toThrow("Nullifier has already been spent");
    });
  });

  describe("Front-running", function () {
    let proofEncoded, nonce;

    beforeAll(async () => {
      // fresh deposit
      const secret = randomBigInt32ModP();
      const nullifier = randomBigInt32ModP();
      const commitment = poseidon2([secret, nullifier]);

      const hash = await depositor.writeContract({
        ...contract,
        functionName: "deposit",
        args: [commitment],
        value: DEPOSIT_AMOUNT,
      });
      await client.waitForTransactionReceipt({ hash });
      jsTree.insert(commitment);

      // proof targeting wihtdrawer address
      const leafIndex = jsTree.indexOf(commitment);
      const merkleProof = jsTree.createProof(leafIndex);
      const siblings = merkleProof.siblings.map(function (s) {
        return Array.isArray(s) ? s[0] : s;
      });
      const pathIndices = merkleProof.pathIndices;

      nonce = randomBigInt32ModP();
      const to = withdrawer.account.address;
      const zkNonce = poseidon4([
        BigInt(foundry.id),
        BigInt(contract.address),
        BigInt(to),
        nonce,
      ]);

      const { proof, publicSignals } = await groth16.fullProve(
        {
          secret: secret.toString(),
          nullifier: nullifier.toString(),
          nonce: zkNonce.toString(),
          siblings: siblings.map(function (s) {
            return s.toString();
          }),
          pathIndices: pathIndices,
        },
        wasmFile,
        zkeyFile,
      );

      const proofCalldata = await groth16.exportSolidityCallData(
        proof,
        publicSignals,
      );
      const proofCalldataFormatted = JSON.parse("[" + proofCalldata + "]");
      proofEncoded = encodeAbiParameters(
        [
          { type: "uint256[2]" },
          { type: "uint256[2][2]" },
          { type: "uint256[2]" },
          { type: "uint256[4]" },
        ],
        proofCalldataFormatted,
      );
    });

    it("should reject withdrawal to a different address than proof was generated for", async function () {
      await expect(
        attacker.writeContract({
          ...contract,
          functionName: "withdraw",
          args: [proofEncoded, attacker.account.address, nonce],
        }),
      ).rejects.toThrow("Nonce does not match");
    });
  });
});
