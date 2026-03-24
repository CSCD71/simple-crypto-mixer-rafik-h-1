<script lang="ts">
	import '../app.css';
	import WalletButton from '$lib/components/WalletButton.svelte';
	import { wallet } from '$lib/utils/wallet.svelte';
	import { ETHERSCAN_URL } from '$lib/contracts/mixer';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		wallet.setupListeners();
		return () => {
			wallet.cleanupListeners();
		};
	});
</script>

<div class="min-h-screen bg-mixer-bg text-mixer-text flex flex-col">
	<!-- Header -->
	<header class="border-b border-mixer-muted/20 px-6 py-4">
		<div class="max-w-4xl mx-auto flex items-center justify-between">
			<div class="flex items-center gap-3">
				<h1 class="text-xl font-bold">Crypto Mixer</h1>
				<span class="text-mixer-muted text-xs bg-mixer-muted/10 px-2 py-0.5 rounded">
					Sepolia
				</span>
			</div>
			<WalletButton />
		</div>
	</header>

	<!-- Main Content -->
	<main class="flex-1 px-6 py-8">
		<div class="max-w-4xl mx-auto">
			{@render children()}
		</div>
	</main>

	<!-- Footer -->
	<footer class="border-t border-mixer-muted/20 px-6 py-4">
		<div
			class="max-w-4xl mx-auto flex flex-col sm:flex-row items-center
                justify-between gap-2 text-mixer-muted text-sm"
		>
			<p>Privacy-preserving crypto mixer using zk-SNARKs</p>
			<a
				href={ETHERSCAN_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="text-mixer-accent hover:underline"
			>
				View Contract on Etherscan
			</a>
		</div>
	</footer>
</div>
