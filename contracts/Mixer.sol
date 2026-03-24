// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.32;

import { PoseidonT5 } from "poseidon-solidity/PoseidonT5.sol";
import { IncrementalBinaryTree, IncrementalTreeData } from "@zk-kit/incremental-merkle-tree.sol/IncrementalBinaryTree.sol";
import { ProofOfMembershipVerifier } from "./ProofOfMembershipVerifier.sol";


// NOTE: this contract was based on PasswordWallet.sol which was given in /07 from https://github.com/ThierrySans/CSCD21/tree/master
// withdraw function in specific is almost the same logic as the transfer function in the passwordwallet contract

contract Mixer {


    ProofOfMembershipVerifier private immutable VERIFIER;

    // on chain merkle tree that stores all deposit commitments
    IncrementalTreeData public tree;
    // tracks which nullifiers have already been used to prevent double withdrawals
    mapping(uint256 => bool) public spentNullifiers;
    constructor(ProofOfMembershipVerifier _verifier) {
        VERIFIER = _verifier;
        IncrementalBinaryTree.init(tree, 20, 0); }

    event Deposit(uint256 indexed commitment, uint256 leafIndex, uint256 timestamp);
    event Withdrawal(address indexed to, uint256 nullifier);

    
    function deposit(uint256 commitment) payable public {
        // 0.1 ether is equivalent to writing out 100000000000000000, very nice qol
        require(msg.value == 0.1 ether, "deposit must be exactly 0.1 ether");
        emit Deposit(commitment, tree.numberOfLeaves, block.timestamp);
        IncrementalBinaryTree.insert(tree, commitment);
    }

    // alternatively we could use T3 by chaining hash(hash(chainid, contract), hash(to, nonce))
    // but that would require 3 hash calls instead of 1, costing more gas overall
    function getHash(address payable to, uint256 nonce) public view returns(uint256) {
        return PoseidonT5.hash([
            uint256(block.chainid),           // to prevent reuse across multiple chains
            uint256(uint160(address(this))),  // to prevent reuse with another contract
            uint256(uint160(address(to))),
            nonce
        ]);
    }

    function withdraw(bytes calldata proof, address payable to, uint256 nonce) public {
        // unwrap the proof (to extract signals)
        ( uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC, uint256[4] memory signals)
            = abi.decode(proof, (uint256[2], uint256[2][2], uint256[2], uint256[4]));
        // check the proof
        // modified from the example cause i think this is simpler 
        require(VERIFIER.verifyProof(pA, pB, pC, signals), "Proof verification failed");
        // extract data from signals
        uint256 root = signals[0];
        uint256 nullifier = signals[2];
        uint256 zkNonce = signals[3];
        // check hash
        require(root == tree.root, "Merkle root does not match");
        require(zkNonce == getHash(to, nonce), "Nonce does not match");
        // Check and update nullifier reuse
        require(!spentNullifiers[nullifier], "Nullifier has already been spent");
        spentNullifiers[nullifier] = true;
        // Transfer funds
        (bool sent, ) = to.call{value: 0.1 ether}("");
        require(sent, "Failed to send Ether");
        emit Withdrawal(to, nullifier);
    }
}
