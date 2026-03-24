pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

template MerkleTreeInclusionProof(nLevels) {
    signal input leaf;
    signal input pathIndices[nLevels];
    signal input siblings[nLevels];
    signal output root;

    component poseidons[nLevels];
    component mux[nLevels];

    signal hashes[nLevels + 1];
    hashes[0] <== leaf;

    for (var i = 0; i < nLevels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        poseidons[i] = Poseidon(2);
        mux[i] = MultiMux1(2);

        mux[i].c[0][0] <== hashes[i];
        mux[i].c[0][1] <== siblings[i];

        mux[i].c[1][0] <== siblings[i];
        mux[i].c[1][1] <== hashes[i];

        mux[i].s <== pathIndices[i];

        poseidons[i].inputs[0] <== mux[i].out[0];
        poseidons[i].inputs[1] <== mux[i].out[1];

        hashes[i + 1] <== poseidons[i].out;
    }

    root <== hashes[nLevels];
}


template ProofOfMembership(levels) {

    // private inputs
    signal input secret;
    signal input siblings[levels];
    signal input pathIndices[levels];

    // public inputs
    signal input nullifier;
    signal input nonce;

    // public outputs
    signal output root;
    signal output authHash;

    // compute the commitment hash
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs <== [secret, nullifier];

    // compute the merkle root from Merkle Proof values
    component tree = MerkleTreeInclusionProof(levels);
    tree.leaf <== commitmentHasher.out;
    for (var i = 0; i < levels; i++) {
        tree.siblings[i] <== siblings[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    root <== tree.root;

    // context binding
    component authHasher = Poseidon(3);
    authHasher.inputs <== [secret, nullifier, nonce];
    authHash <== authHasher.out;
}

component main {public [nullifier, nonce]} = ProofOfMembership(20);
