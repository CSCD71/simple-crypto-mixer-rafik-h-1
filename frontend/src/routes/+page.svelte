<script lang="ts">
	import DepositForm from '$lib/components/DepositForm.svelte';
	import WithdrawForm from '$lib/components/WithdrawForm.svelte';
	import { wallet } from '$lib/utils/wallet.svelte';
</script>

<svelte:head>
	<title>Crypto Mixer - Private Transactions on Sepolia</title>
</svelte:head>

<div class="space-y-8">
	<!-- Hero -->
	<section class="text-center space-y-3 py-4">
		<h2 class="text-3xl font-bold">Private Ethereum Transactions</h2>
		<p class="text-mixer-muted max-w-2xl mx-auto">
			Deposit ETH into the mixer pool and withdraw to a different address. Zero-knowledge proofs
			ensure that deposits and withdrawals cannot be linked.
		</p>
	</section>

	{#if !wallet.isConnected}
		<!-- Connect wallet prompt -->
		<div class="bg-mixer-card rounded-xl p-8 text-center space-y-4">
			<p class="text-mixer-muted">Connect your MetaMask wallet to get started.</p>
			<button
				onclick={() => wallet.connect()}
				disabled={wallet.isConnecting}
				class="bg-mixer-accent hover:bg-mixer-accent/80 text-white
               px-6 py-3 rounded-lg font-medium transition-colors cursor-pointer
               disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{wallet.isConnecting ? 'Connecting...' : 'Connect MetaMask'}
			</button>
			{#if wallet.error}
				<p class="text-mixer-danger text-sm">{wallet.error}</p>
			{/if}
		</div>
	{:else if wallet.isWrongNetwork}
		<!-- Wrong network warning -->
		<div
			class="bg-mixer-warning/10 border border-mixer-warning/30 rounded-xl p-8 text-center space-y-2"
		>
			<p class="text-mixer-warning font-medium text-lg">Wrong Network</p>
			<p class="text-mixer-muted">
				Please switch your MetaMask wallet to the Sepolia test network.
			</p>
		</div>
	{:else}
		<!-- Main content: deposit and withdraw forms -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<DepositForm />
			<WithdrawForm />
		</div>
	{/if}

	<!-- How it works section -->
	<section class="bg-mixer-card rounded-xl p-6 space-y-4">
		<h3 class="text-lg font-semibold text-mixer-text">How It Works</h3>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
			<div class="space-y-2">
				<div class="text-mixer-accent font-bold text-2xl">1</div>
				<h4 class="font-medium text-mixer-text">Deposit</h4>
				<p class="text-mixer-muted">
					Generate a secret note and deposit 0.1 ETH. Save your note securely -- it is the only
					way to withdraw.
				</p>
			</div>
			<div class="space-y-2">
				<div class="text-mixer-accent font-bold text-2xl">2</div>
				<h4 class="font-medium text-mixer-text">Wait</h4>
				<p class="text-mixer-muted">
					Other users deposit into the same pool. The more deposits, the stronger your privacy.
				</p>
			</div>
			<div class="space-y-2">
				<div class="text-mixer-accent font-bold text-2xl">3</div>
				<h4 class="font-medium text-mixer-text">Withdraw</h4>
				<p class="text-mixer-muted">
					Use your note to generate a zero-knowledge proof and withdraw 0.1 ETH to any address.
					Nobody can link your deposit to your withdrawal.
				</p>
			</div>
		</div>
	</section>
</div>
