#!/bin/bash
set -e
source .env

# Helper: update foundry.toml libraries config
update_libraries() {
  sed -i '/^libraries/d' foundry.toml
  if [ -n "$1" ]; then
    echo "libraries = [$1]" >> foundry.toml
  fi
}

echo "=== Deploying PoseidonT3 ==="
POSEIDONT3=$(forge create --broadcast node_modules/poseidon-solidity/PoseidonT3.sol:PoseidonT3 \
  --rpc-url "$SEPOLIA_URL" --private-key "$ACCOUNT_PRIVATE_KEY" \
  2>&1 | grep "Deployed to:" | awk '{print $3}')
echo "PoseidonT3: $POSEIDONT3"

echo "=== Deploying PoseidonT5 ==="
POSEIDONT5=$(forge create --broadcast node_modules/poseidon-solidity/PoseidonT5.sol:PoseidonT5 \
  --rpc-url "$SEPOLIA_URL" --private-key "$ACCOUNT_PRIVATE_KEY" \
  2>&1 | grep "Deployed to:" | awk '{print $3}')
echo "PoseidonT5: $POSEIDONT5"

# Link PoseidonT3 so IncrementalBinaryTree can compile against it
echo "=== Linking PoseidonT3 in foundry.toml ==="
update_libraries "\"node_modules/poseidon-solidity/PoseidonT3.sol:PoseidonT3:$POSEIDONT3\""

echo "=== Deploying IncrementalBinaryTree ==="
TREE=$(forge create --broadcast node_modules/@zk-kit/incremental-merkle-tree.sol/IncrementalBinaryTree.sol:IncrementalBinaryTree \
  --rpc-url "$SEPOLIA_URL" --private-key "$ACCOUNT_PRIVATE_KEY" \
  2>&1 | grep "Deployed to:" | awk '{print $3}')
echo "IncrementalBinaryTree: $TREE"

echo "=== Deploying Verifier ==="
VERIFIER=$(forge create --broadcast contracts/ProofOfMembershipVerifier.sol:ProofOfMembershipVerifier \
  --rpc-url "$SEPOLIA_URL" --private-key "$ACCOUNT_PRIVATE_KEY" \
  2>&1 | grep "Deployed to:" | awk '{print $3}')
echo "Verifier: $VERIFIER"

# Link all libraries so Mixer can compile against them
echo "=== Linking all libraries in foundry.toml ==="
update_libraries "\"node_modules/poseidon-solidity/PoseidonT3.sol:PoseidonT3:$POSEIDONT3\", \"node_modules/poseidon-solidity/PoseidonT5.sol:PoseidonT5:$POSEIDONT5\", \"node_modules/@zk-kit/incremental-merkle-tree.sol/IncrementalBinaryTree.sol:IncrementalBinaryTree:$TREE\""

echo "=== Deploying Mixer ==="
MIXER=$(forge create --broadcast contracts/Mixer.sol:Mixer \
  --rpc-url "$SEPOLIA_URL" --private-key "$ACCOUNT_PRIVATE_KEY" \
  --constructor-args "$VERIFIER" \
  2>&1 | grep "Deployed to:" | awk '{print $3}')
echo "Mixer: $MIXER"

echo ""
echo "=== Deployment Complete ==="
echo "PoseidonT3:            $POSEIDONT3"
echo "PoseidonT5:            $POSEIDONT5"
echo "IncrementalBinaryTree: $TREE"
echo "Verifier:              $VERIFIER"
echo "Mixer:                 $MIXER"
echo "Etherscan:             https://sepolia.etherscan.io/address/$MIXER"

echo ""
echo "=== Verifying Mixer on Etherscan ==="
forge verify-contract "$MIXER" contracts/Mixer.sol:Mixer \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --chain sepolia \
  --constructor-args $(cast abi-encode "constructor(address)" "$VERIFIER")
