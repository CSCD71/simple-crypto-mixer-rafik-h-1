<script lang="ts">
	import { wallet } from '$lib/utils/wallet.svelte';
	import {
		decodeNote,
		generateProof,
		generateSecret,
		formatProofForContract,
		computeCommitment
	} from '$lib/utils/zk';
	import { reconstructTree, getMerkleProof, findCommitmentIndex } from '$lib/utils/merkle';
	import { withdraw, getDepositEvents, getHash } from '$lib/contracts/mixer';
	import { type Address, isAddress } from 'viem';

	function friendlyError(err: unknown): string {
		const msg = err instanceof Error ? err.message : 'Withdrawal failed';
		if (msg.includes('User denied') || msg.includes('User rejected')) {
			return 'Transaction was rejected in wallet.';
		}
		// viem errors often have the useful reason on the first line
		const firstLine = msg.split('\n')[0];
		return firstLine;
	}

	let noteInput = $state('');
	let recipientAddress = $state('');
	let isWithdrawing = $state(false);
	let withdrawStep = $state<'input' | 'proving' | 'submitting' | 'success'>('input');
	let txHash = $state<string | null>(null);
	let withdrawError = $state<string | null>(null);
	let statusMessage = $state('');

	function handleFileUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			noteInput = (e.target?.result as string).trim();
		};
		reader.readAsText(file);
	}

	async function handleWithdraw() {
		if (!wallet.walletClient || !wallet.publicClient) return;

		isWithdrawing = true;
		withdrawError = null;

		try {
			// Step 1: Decode the note
			statusMessage = 'Decoding note...';
			const note = decodeNote(noteInput.trim());
			const secret = BigInt(note.secret);
			const nullifier = BigInt(note.nullifier);
			const commitment = computeCommitment(secret, nullifier);

			// Verify commitment matches
			if (commitment.toString() !== note.commitment) {
				throw new Error('Note is corrupted: commitment does not match secret and nullifier.');
			}

			// Validate recipient address
			if (!isAddress(recipientAddress)) {
				throw new Error('Invalid recipient address.');
			}

			// Step 2: Fetch deposit events and reconstruct tree
			statusMessage = 'Fetching deposits from contract...';
			withdrawStep = 'proving';
			const deposits = await getDepositEvents(wallet.publicClient);
			const commitments = deposits.map((d) => d.commitment);

			// Step 3: Find the commitment in the tree
			const leafIndex = findCommitmentIndex(commitments, commitment);
			if (leafIndex === -1) {
				throw new Error(
					'Your commitment was not found in the mixer. Make sure you have deposited.'
				);
			}

			// Step 4: Reconstruct tree and generate Merkle proof
			statusMessage = 'Reconstructing Merkle tree...';
			const tree = reconstructTree(commitments);
			const merkleProof = getMerkleProof(tree, leafIndex);

			// Step 5: Compute anti front running nonce
			// generate a random nonce, then call getHash on the contract to get the
			// context binding hash (poseidon of chainid, contract, recipient, nonce)
			statusMessage = 'Computing context binding hash...';
			const nonce = generateSecret();
			const zkNonce = await getHash(
				recipientAddress as Address,
				nonce,
				wallet.publicClient
			);

			// Step 6: Generate ZK proof
			statusMessage = 'Generating zero-knowledge proof (this may take a moment)...';
			const { proof, publicSignals } = await generateProof(
				secret,
				nullifier,
				zkNonce,
				merkleProof.siblings,
				merkleProof.pathIndices
			);

			// Step 7: Format proof for contract
			statusMessage = 'Formatting proof for contract...';
			const calldata = await formatProofForContract(proof, publicSignals);

			// Debug: log proof data for troubleshooting
			console.log('=== Withdraw Debug ===');
			console.log('Public signals:', publicSignals);
			console.log('Nonce (raw):', nonce.toString());
			console.log('zkNonce (getHash result):', zkNonce.toString());
			console.log('Recipient:', recipientAddress);
			console.log('Calldata:', calldata);

			// Step 8: Simulate first to get revert reason
			statusMessage = 'Simulating transaction...';
			try {
				await wallet.publicClient.simulateContract({
					address: '0x8015D3fD8b026ae8332c7547c18396c4AD117178',
					abi: [{ type: 'function', name: 'withdraw', inputs: [{ name: 'proof', type: 'bytes' }, { name: 'to', type: 'address' }, { name: 'nonce', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }],
					functionName: 'withdraw',
					args: [calldata, recipientAddress as Address, nonce],
					account: wallet.address!
				});
			} catch (simErr) {
				console.error('Simulation failed:', simErr);
				throw simErr;
			}

			// Step 9: Submit withdrawal transaction
			statusMessage = 'Submitting withdrawal transaction...';
			withdrawStep = 'submitting';
			const hash = await withdraw(
				calldata,
				recipientAddress as Address,
				nonce,
				wallet.walletClient
			);

			// Wait for the transaction to be mined and check status
			statusMessage = 'Waiting for confirmation...';
			const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash });
			if (receipt.status === 'reverted') {
				throw new Error('Transaction reverted on-chain. The nullifier may have already been spent.');
			}

			txHash = hash;
			withdrawStep = 'success';
			statusMessage = '';
		} catch (err) {
			withdrawError = friendlyError(err);
			withdrawStep = 'input';
			statusMessage = '';
		} finally {
			isWithdrawing = false;
		}
	}

	function handleReset() {
		noteInput = '';
		recipientAddress = '';
		txHash = null;
		withdrawError = null;
		withdrawStep = 'input';
		statusMessage = '';
	}

	const isFormValid = $derived(
		noteInput.trim().length > 0 &&
			recipientAddress.trim().length > 0 &&
			wallet.isConnected &&
			!wallet.isWrongNetwork
	);
</script>

<div class="bg-mixer-card rounded-xl p-6 space-y-6">
	<h2 class="text-xl font-bold text-mixer-text">Withdraw</h2>
	<p class="text-mixer-muted text-sm">
		Withdraw 0.1 ETH using your private note. Funds will be sent to the recipient address you
		specify.
	</p>

	{#if withdrawStep === 'input'}
		<div class="space-y-4">
			<div>
				<label for="note-input" class="block text-mixer-muted text-sm mb-2">
					Your Note (base64-encoded)
				</label>
				<textarea
					id="note-input"
					bind:value={noteInput}
					placeholder="Paste your note here..."
					rows={3}
					class="w-full bg-mixer-bg border border-mixer-muted/30 rounded-lg p-3
                 text-mixer-text font-mono text-sm resize-none
                 focus:outline-none focus:border-mixer-accent"
				></textarea>
				<div class="mt-2">
					<label class="text-mixer-accent text-sm cursor-pointer hover:underline">
						Or upload note file
						<input type="file" accept=".txt" class="hidden" onchange={handleFileUpload} />
					</label>
				</div>
			</div>

			<div>
				<label for="recipient" class="block text-mixer-muted text-sm mb-2">
					Recipient Address
				</label>
				<input
					id="recipient"
					type="text"
					bind:value={recipientAddress}
					placeholder="0x..."
					class="w-full bg-mixer-bg border border-mixer-muted/30 rounded-lg p-3
                 text-mixer-text font-mono text-sm
                 focus:outline-none focus:border-mixer-accent"
				/>
			</div>

			<button
				onclick={handleWithdraw}
				disabled={!isFormValid || isWithdrawing}
				class="w-full bg-mixer-accent hover:bg-mixer-accent/80 text-white
               py-3 rounded-lg font-medium transition-colors
               disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
			>
				Withdraw 0.1 ETH
			</button>
		</div>
	{:else if withdrawStep === 'proving' || withdrawStep === 'submitting'}
		<div class="text-center space-y-4 py-8">
			<div
				class="animate-spin w-8 h-8 border-2 border-mixer-accent
                  border-t-transparent rounded-full mx-auto"
			></div>
			<p class="text-mixer-text">{statusMessage}</p>
		</div>
	{:else if withdrawStep === 'success'}
		<div class="bg-mixer-success/10 border border-mixer-success/30 rounded-lg p-4 space-y-2">
			<p class="text-mixer-success font-medium">Withdrawal successful!</p>
			{#if txHash}
				<a
					href={`https://sepolia.etherscan.io/tx/${txHash}`}
					target="_blank"
					rel="noopener noreferrer"
					class="text-mixer-accent hover:underline text-sm break-all"
				>
					View transaction on Etherscan
				</a>
			{/if}
		</div>

		<button
			onclick={handleReset}
			class="w-full bg-mixer-muted/20 hover:bg-mixer-muted/30 text-mixer-text
             py-2 rounded-lg text-sm transition-colors cursor-pointer"
		>
			Make Another Withdrawal
		</button>
	{/if}

	{#if withdrawError}
		<div class="bg-mixer-danger/10 border border-mixer-danger/20 rounded-lg p-4 max-h-48 overflow-auto">
			<p class="text-mixer-danger text-sm break-words">{withdrawError}</p>
		</div>
	{/if}
</div>
