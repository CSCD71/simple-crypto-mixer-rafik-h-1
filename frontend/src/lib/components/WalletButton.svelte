<script lang="ts">
	import { wallet } from '$lib/utils/wallet.svelte';

	function handleClick() {
		if (wallet.isConnected) {
			wallet.disconnect();
		} else {
			wallet.connect();
		}
	}
</script>

{#if wallet.isConnected}
	<div class="flex items-center gap-3">
		{#if wallet.isWrongNetwork}
			<span class="text-mixer-warning text-sm">Wrong network - switch to Sepolia</span>
		{/if}
		<span class="text-mixer-muted text-sm font-mono">{wallet.shortAddress}</span>
		<button
			onclick={handleClick}
			class="bg-mixer-danger/20 text-mixer-danger hover:bg-mixer-danger/30
             px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
		>
			Disconnect
		</button>
	</div>
{:else}
	<button
		onclick={handleClick}
		disabled={wallet.isConnecting}
		class="bg-mixer-accent hover:bg-mixer-accent/80 text-white
           px-4 py-2 rounded-lg text-sm font-medium transition-colors
           disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
	>
		{wallet.isConnecting ? 'Connecting...' : 'Connect MetaMask'}
	</button>
{/if}

{#if wallet.error}
	<p class="text-mixer-danger text-sm mt-2">{wallet.error}</p>
{/if}
