<script lang="ts">
	import { wallet } from '$lib/utils/wallet.svelte';
	import {
		generateSecret,
		generateNullifier,
		createNote,
		type MixerNote
	} from '$lib/utils/zk';
	import { deposit, DEPOSIT_AMOUNT } from '$lib/contracts/mixer';
	import NoteDisplay from './NoteDisplay.svelte';
	import { formatEther } from 'viem';

	function friendlyError(err: unknown): string {
		const msg = err instanceof Error ? err.message : 'Deposit failed';
		if (msg.includes('User denied') || msg.includes('User rejected')) {
			return 'Transaction was rejected in wallet.';
		}
		const firstLine = msg.split('\n')[0];
		if (firstLine.length > 200) return firstLine.slice(0, 200) + '…';
		return firstLine;
	}

	let currentNote = $state<MixerNote | null>(null);
	let isDepositing = $state(false);
	let txHash = $state<string | null>(null);
	let depositError = $state<string | null>(null);
	let step = $state<'generate' | 'confirm' | 'success'>('generate');

	function handleGenerate() {
		const secret = generateSecret();
		const nullifier = generateNullifier();
		currentNote = createNote(secret, nullifier);
		step = 'confirm';
		txHash = null;
		depositError = null;
	}

	async function handleDeposit() {
		if (!wallet.walletClient || !currentNote) return;

		isDepositing = true;
		depositError = null;

		try {
			const commitment = BigInt(currentNote.commitment);
			const hash = await deposit(commitment, wallet.walletClient);
			txHash = hash;
			step = 'success';
		} catch (err) {
			depositError = friendlyError(err);
		} finally {
			isDepositing = false;
		}
	}

	function handleReset() {
		currentNote = null;
		txHash = null;
		depositError = null;
		step = 'generate';
	}
</script>

<div class="bg-mixer-card rounded-xl p-6 space-y-6">
	<h2 class="text-xl font-bold text-mixer-text">Deposit</h2>
	<p class="text-mixer-muted text-sm">
		Deposit {formatEther(DEPOSIT_AMOUNT)} ETH into the mixer pool.
	</p>

	{#if step === 'generate'}
		<button
			onclick={handleGenerate}
			disabled={!wallet.isConnected || wallet.isWrongNetwork}
			class="w-full bg-mixer-accent hover:bg-mixer-accent/80 text-white
             py-3 rounded-lg font-medium transition-colors
             disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
		>
			Generate Note
		</button>
	{:else if step === 'confirm' && currentNote}
		<NoteDisplay note={currentNote} />

		<button
			onclick={handleDeposit}
			disabled={isDepositing}
			class="w-full bg-mixer-success hover:bg-mixer-success/80 text-white
             py-3 rounded-lg font-medium transition-colors
             disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
		>
			{isDepositing ? 'Depositing...' : `Deposit ${formatEther(DEPOSIT_AMOUNT)} ETH`}
		</button>

		<button
			onclick={handleReset}
			class="w-full bg-mixer-muted/20 hover:bg-mixer-muted/30 text-mixer-text
             py-2 rounded-lg text-sm transition-colors cursor-pointer"
		>
			Cancel
		</button>
	{:else if step === 'success'}
		<div class="bg-mixer-success/10 border border-mixer-success/30 rounded-lg p-4 space-y-2">
			<p class="text-mixer-success font-medium">Deposit successful!</p>
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

		{#if currentNote}
			<NoteDisplay note={currentNote} />
		{/if}

		<button
			onclick={handleReset}
			class="w-full bg-mixer-muted/20 hover:bg-mixer-muted/30 text-mixer-text
             py-2 rounded-lg text-sm transition-colors cursor-pointer"
		>
			Make Another Deposit
		</button>
	{/if}

	{#if depositError}
		<div class="bg-mixer-danger/10 border border-mixer-danger/20 rounded-lg p-4 max-h-32 overflow-auto">
			<p class="text-mixer-danger text-sm break-words">{depositError}</p>
		</div>
	{/if}
</div>
