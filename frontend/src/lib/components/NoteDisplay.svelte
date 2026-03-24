<script lang="ts">
	import type { MixerNote } from '$lib/utils/zk';
	import { encodeNote } from '$lib/utils/zk';

	let { note }: { note: MixerNote } = $props();

	let copied = $state(false);
	const encodedNote = $derived(encodeNote(note));

	async function copyToClipboard() {
		await navigator.clipboard.writeText(encodedNote);
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}

	function downloadNote() {
		const blob = new Blob([encodedNote], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `mixer-note-${Date.now()}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="bg-mixer-card border border-mixer-accent/30 rounded-xl p-6 space-y-4">
	<div class="flex items-center gap-2">
		<h3 class="text-lg font-semibold text-mixer-text">Your Private Note</h3>
		<span class="bg-mixer-warning/20 text-mixer-warning text-xs px-2 py-0.5 rounded">
			SAVE THIS
		</span>
	</div>

	<div class="bg-mixer-bg rounded-lg p-4 border border-mixer-muted/20">
		<p class="text-mixer-muted text-xs mb-2">Commitment:</p>
		<p class="text-mixer-text font-mono text-sm break-all">{note.commitment}</p>
	</div>

	<div class="bg-mixer-bg rounded-lg p-4 border border-mixer-muted/20">
		<p class="text-mixer-muted text-xs mb-2">Encoded Note (base64):</p>
		<p class="text-mixer-text font-mono text-xs break-all select-all leading-relaxed">
			{encodedNote}
		</p>
	</div>

	<div class="flex gap-3">
		<button
			onclick={copyToClipboard}
			class="bg-mixer-accent hover:bg-mixer-accent/80 text-white
             px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
		>
			{copied ? 'Copied!' : 'Copy Note'}
		</button>
		<button
			onclick={downloadNote}
			class="bg-mixer-muted/20 hover:bg-mixer-muted/30 text-mixer-text
             px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
		>
			Download Note
		</button>
	</div>

	<div class="bg-mixer-danger/10 border border-mixer-danger/20 rounded-lg p-4">
		<p class="text-mixer-danger text-sm font-medium">Warning</p>
		<p class="text-mixer-muted text-sm mt-1">
			Save this note securely. It is the ONLY way to withdraw your funds. If you lose it, your
			0.1 ETH is permanently locked. This note is never stored on-chain or on any server.
		</p>
	</div>
</div>
