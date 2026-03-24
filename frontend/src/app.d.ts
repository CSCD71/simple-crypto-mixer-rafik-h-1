// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		ethereum?: {
			request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
			on: (event: string, callback: (...args: unknown[]) => void) => void;
			removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
			isMetaMask?: boolean;
		};
	}
}

export {};
