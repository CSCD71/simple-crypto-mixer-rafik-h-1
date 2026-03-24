# Simple Crypto Mixer

A **crypto mixer** allows users to deposit funds into a shared pool and later withdraw them to a different address in a way that breaks the public link between the deposit and the withdrawal.

In this assignment, you will implement a simplified privacy‑preserving mixer using **Zero‑Knowledge Proofs (zk‑SNARKs)**.

The goal is to understand how **cryptographic commitments, Merkle trees, and zero‑knowledge proofs** can be used to achieve privacy in blockchain systems.

------------------------------------------------------------------------

## Prerequisites

A crypto mixer leverages a Zero‑Knowledge algorithm called **Proof of Membership**.  

Before starting this assignment, we recommend that you familiarize yourself with **Zero‑Knowledge Proofs**, **zk‑SNARKs**, and common proof constructions such as **Proof of Commitment** and **Proof of Membership**.

Recommended readings:

- [Introduction to Zero-Knowledge Proofs](https://thierrysans.me/HandsOnZkProofs/introduction)
- [Getting Started with zk-SNARKs](https://thierrysans.me/HandsOnZkProofs/getting-started)
- [Proof of Commitment](https://thierrysans.me/HandsOnZkProofs/proofs/proof-of-commitment)
- [Proof of Membership](https://thierrysans.me/HandsOnZkProofs/proofs/proof-of-membership)

## Requirements

A crypto mixer is a protocol that allows users to **anonymize their funds by mixing them with funds from other users**. The basic idea is simple:

1. **Deposit:** Users deposit funds into a smart contract. The contract records a cryptographic commitment representing the deposit.
2. **Withdraw:** Later, a user can withdraw the funds to a new address. Instead of revealing which deposit they made, the user provides a **zero‑knowledge proof** that they own one of the deposits in the pool.

This allows the contract to verify that the withdrawal is legitimate and that the same deposit is not withdrawn twice, **without revealing which deposit belongs to the user**.

As a result, the public blockchain **cannot link deposits and withdrawals**.

### Deposit

A user generates a **secret** and a **nullifier** locally, and computes a commitment hash using **Poseidon**:

```
commitment = Poseidon(secret, nullifier)
```

The user sends a transaction to the **Mixer** contract with a fixed amount of ETH (set to **0.1 ETH** for the purpose of this assignment):

```solidity
deposit(commitment)
```

The Mixer contract:

- inserts the commitment into a **Merkle tree**
- emits an event containing the commitment that was added to the tree

### Withdraw

A user who wants to withdraw funds corresponding to a specific commitment must know:

- the **secret** and **nullifier** associated with that commitment
- the **set of commitments** needed to reconstruct the same Merkle tree as stored in the Mixer contract

Using the **Proof‑of‑Membership circuit**, the user proves the following statement:

> “I know a `secret` and a `nullifier` such that `Poseidon(secret, nullifier)` exists in the Merkle tree of deposits.”

As explained in the ZK tutorial:

- the **secret remains private** (private input)
- the **nullifier becomes public** (public input)

The proof does **not reveal which commitment is used**, while the nullifier prevents **double withdrawals** for the same commitment.

The user then sends a transaction to the Mixer contract to withdraw **0.1 ETH** to address `to` using the `proof` and a `nonce`.

```solidity
withdraw(proof, to, nonce)
```

------------------------------------------------------------------------

## Contract Specification

The **Mixer** smart contract must implement **at least** the following functions with their **exact signatures**:

```solidity
function deposit(uint256 commitment) payable public
```

This function allows users to deposit **exactly 0.1 ETH** into the contract and add the `commitment` to the on‑chain Merkle tree.

```solidity
function withdraw(bytes calldata proof, address payable to, uint256 nonce) public
```

This function allows a user to withdraw **exactly 0.1 ETH** from the contract to address `to` using `proof` and `nonce`.

------------------------------------------------------------------------

## dApp Specification

You must build and deploy (**over HTTPS with a public URL**) a decentralized application (**dApp**) that interacts with your Mixer contract.

The dApp must allow users to:

- Connect and disconnect using **MetaMask**
- View a link to the deployed **Mixer** contract on **Sepolia Etherscan**
- Generate **secrets and nullifiers** to deposit funds into the mixer
- Store or share secrets and nullifiers in a **user‑friendly but privacy‑preserving way**
- Generate **zk‑proofs** from secrets and nullifiers to withdraw funds from the mixer

------------------------------------------------------------------------

## Challenges

### Using Zero-Knowledge Proofs

You may reuse the **Circom circuit provided in the tutorial**. You do not need to modify it, although you are free to extend it if necessary.

However, you **must fully understand what the circuit does**, as you may be asked to explain it.

We recommend recompiling the circuit and regenerating all **zk‑artifacts** and the **Solidity verifier** from the circuit as described in the tutorial.

### Ensuring Privacy

A user should be able to withdraw funds **without revealing**:

- which commitment in the tree is used
- the secret itself
- the original deposit transaction

### Preventing Double Withdrawal

An attacker must **not** be able to withdraw the same funds twice using the same commitment.

### Preventing Front-Running Attack

A **front‑running attack** occurs when an attacker observes a pending transaction in the mempool and submits another transaction that:

- uses the same information
- is executed **before** the original transaction
- allows the attacker to extract value or disrupt the protocol

Attackers typically achieve this by paying **higher gas fees**, causing miners or validators to prioritize their transaction.

Your Mixer implementation must be **robust against front‑running attacks**.

------------------------------------------------------------------------

## Development Guidelines

For developing your smart contract and dApp, you may use:

- **JavaScript** or **TypeScript**
- the [OpenZeppelin Library](https://www.openzeppelin.com/)
- the **[Foundry](https://www.getfoundry.sh/)** framework for Ethereum (**Hardhat** and **Ganache** are *not* allowed)
- **[Viem](https://viem.sh/)** as the Ethereum JavaScript library (**Ethers.js** and **Web3.js** are *not* allowed)
- **[Vitest](https://vitest.dev/)** (if needed) for unit testing (**Mocha** is *not* allowed)
- any frontend technology of your choice to develop the dApp

Specifically to this assignment, you should use:

- [SnarkJs](https://www.npmjs.com/package/snarkjs) for handling zk proofs
- [Poseidon Lite](https://www.npmjs.com/package/poseidon-lite) for creating Poseidon hashes in the Javascript/Typescript client
- [Poseidon Solidity](https://www.npmjs.com/package/poseidon-solidity) for creating Poseidon hashes in a Solidity contract
- [Incremental Merkle Tree (JS/TS)](https://www.npmjs.com/package/@zk-kit/incremental-merkle-tree) for using Merkle Trees in the  Javascript/Typescript client
- [Incremental Merkle Trees (Solidity)](https://www.npmjs.com/package/@zk-kit/incremental-merkle-tree.sol) for using Merkle Trees in a Solidity contract

We are going to adopt the same strategy as the **Auction House** or the **Limit-Order Exchange**:

- **Phase 1:** Smart contract implementation and testing on a local development chain. For tests, feel free to write them in **Solidity** (as recommended by the Foundry framework) or in **JavaScript/TypeScript** (as done in class).
- **Phase 2:** Deployment to the **Sepolia** chain with **contract verification**.
- **Phase 3:** Frontend implementation and deployment over **HTTPS** on a publicly accessible URL.

------------------------------------------------------------------------

## Use of AI

> [!IMPORTANT]  
> Where allowed, you must clearly **reference** code generated with AI, even if it is only slightly modified, in your source code. In the end, you are fully responsible for the work you submit under your name, and you should be able to explain in detail what any piece of code does (including AI-generated code) when asked by the course staff.

- You are **not allowed** to use AI to write the Solidity contract.
- You are **not allowed** to use AI to write the **core/required unit tests** that test the full feature set of your **Mixer** smart contract as specified in the **Contract Specification** above.
- However, you **are allowed** to use AI to write **additional** tests (edge cases, failing conditions, and so on). Make sure these tests are in a **separate file** and clearly identified as **AI-generated**.
- You are **allowed** to use AI for non-contract code (e.g., frontend scaffolding, UI copy, documentation), provided you properly disclose it where applicable and you still fully understand what you submit.

Any violation of this policy will be considered an **Academic Integrity** violation and will be reported to the **Dean’s Office for Academic Integrity**. Depending on the circumstances, the risk can range from receiving a **0** on the assignment and not being able to drop the course, all the way to being **suspended** or **expelled** from the university.

------------------------------------------------------------------------

## Group Work and Late Policy

You may work on this assignment individually or with a partner. If you decide to work as a group, you are fully responsible for the work you submit to the team repository as your contribution to the group.

You should submit the code as a group. If you decide to use late days, make sure that **all** team members are allowed to use these late days. Any student exceeding their late days will receive a **0** individually, as per the course policy.

------------------------------------------------------------------------

## Deliverables

1. All of your smart contract code, unit tests, and frontend code must be in the **same repository**.

2. At the root of your assignment repository on GitHub, include a `README.md` file with:

   - a working link to your deployed dApp
   - a working link to your deployed smart contract on the **[Sepolia Etherscan block explorer](https://sepolia.etherscan.io/)**. Make sure your contract is **verified**, meaning the Solidity source code has been published on Etherscan.
   - a detailed, step-by-step guide explaining how to:
     - install all dependencies,
     - run your unit tests,
     - deploy your contract to Sepolia,
     - and run your dApp frontend locally.