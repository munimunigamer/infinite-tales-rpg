<script lang="ts">
	import { onMount } from 'svelte';
	import { LLMProvider } from '$lib/ai/llmProvider';
	import {
		GameAgent,
		type GameMasterAnswer,
		type InventoryState,
		type PlayerCharactersGameState
	} from '$lib/ai/agents/gameAgent';
	import { useLocalStorage } from '$lib/state/useLocalStorage.svelte';
	import type { Story } from '$lib/ai/agents/storyAgent';
	import type { CharacterDescription } from '$lib/ai/agents/characterAgent';
	import type { LLMMessage } from '$lib/ai/llm';
	import LoadingModal from '$lib/components/LoadingModal.svelte';
	import { stringifyPretty } from '$lib/util.svelte';

	let {
		onclose,
		question,
		playerCharactersGameState
	}: {
		onclose?;
		question: string;
		playerCharactersGameState: PlayerCharactersGameState;
	} = $props();

	const apiKeyState = useLocalStorage<string>('apiKeyState');
	const customSystemInstruction = useLocalStorage<string>('customSystemInstruction');
	const aiLanguage = useLocalStorage<string>('aiLanguage');
	const storyState = useLocalStorage<Story>('storyState');
	const characterState = useLocalStorage<CharacterDescription>('characterState');
	const historyMessagesState = useLocalStorage<LLMMessage[]>('historyMessagesState');
	const inventoryState = useLocalStorage<InventoryState>('inventoryState', {});

	let gameAgent;
	let gmAnswerState: GameMasterAnswer | undefined = $state();
	let isGeneratingState: boolean = $state(false);

	onMount(async () => {
		const llm = LLMProvider.provideLLM({
			temperature: 0.7,
			language: aiLanguage.value,
			apiKey: apiKeyState.value
		});
		gameAgent = new GameAgent(llm);
		isGeneratingState = true;
		gmAnswerState = await gameAgent.generateAnswerForPlayerQuestion(
			question,
			customSystemInstruction.value,
			historyMessagesState.value,
			storyState.value,
			characterState.value,
			playerCharactersGameState,
			inventoryState.value
		);
		console.log(stringifyPretty(gmAnswerState));
		isGeneratingState = false;
		if(!gmAnswerState){
			onclose(false);
		}
	});
</script>

{#if isGeneratingState}
	<LoadingModal />
{:else}
	<dialog open class="z-100 modal" style="background: rgba(0, 0, 0, 0.3);">
		<div class="modal-box flex flex-col items-center text-center">
			<span class="m-auto font-bold">Game Master Answer</span>
			<p class="max-h-48 mt-4 overflow-y-scroll">{gmAnswerState?.answerToPlayer}</p>
			<details class="collapse collapse-arrow textarea-bordered border bg-base-200 mt-4 overflow-y-scroll">
				<summary class="collapse-title capitalize">
					<p>Considered Game State</p>
				</summary>
				<p>{gmAnswerState?.game_state_considered || 'The AI did not return a response...'}</p>
			</details>
			<details class="collapse collapse-arrow textarea-bordered border bg-base-200 mt-4 overflow-y-scroll">
				<summary class="collapse-title capitalize">
					<p>Considered Rules</p>
				</summary>
				<ul class="text-start">
					{#each gmAnswerState?.rules_considered || [] as rule}
						<li class="list-item mt-1 ml-2">
							{rule.startsWith('-') ? rule : '- ' + rule}
						</li>
					{/each}
				</ul>
			</details>
			<button class="btn btn-info mt-3" onclick={() => onclose(true)}>Close</button>
		</div>
	</dialog>
{/if}
