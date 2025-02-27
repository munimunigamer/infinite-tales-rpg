<script lang="ts">
	import TargetModal from '$lib/components/interaction_modals/TargetModal.svelte';
	import { type Ability, CharacterStatsAgent } from '$lib/ai/agents/characterStatsAgent';
	import type { Action, Targets } from '$lib/ai/agents/gameAgent';
	import AIGeneratedImage from '$lib/components/AIGeneratedImage.svelte';
	import { useLocalStorage } from '$lib/state/useLocalStorage.svelte';
	import type { AIConfig } from '$lib';

	let {
		abilities,
		playerName,
		storyImagePrompt,
		currentMP,
		targets,
		onclose,
		dialogRef = $bindable()
	}: {
		abilities: Array<Ability>;
		playerName: string;
		storyImagePrompt: string;
		currentMP: number;
		targets: Targets;
		onclose;
		dialogRef;
	} = $props();

	const aiConfigState = useLocalStorage<AIConfig>('aiConfigState');
	// eslint-disable-next-line svelte/valid-compile
	let targetModalRef;
	let abilityActionState = $state({} as Action);

	function mapAbilityToAction(ability: Ability) {
		abilityActionState = {
			characterName: playerName,
			...ability,
			type: 'Spell',
			text:
				playerName +
				' casts ' +
				ability.name +
				': ' +
				ability.effect +
				' (' +
				ability.mp_cost +
				' MP)'
		};
	}
</script>

{#if targets}
	<TargetModal bind:dialogRef={targetModalRef} {targets} action={abilityActionState} {onclose}
	></TargetModal>
{/if}
<dialog bind:this={dialogRef} class="z-100 modal" style="background: rgba(0, 0, 0, 0.3);">
	<div class="modal-box flex flex-col items-center">
		<form method="dialog">
			<span class="m-auto">Spells & Abilities</span>
			<button class="btn btn-circle btn-ghost btn-sm absolute right-2 top-2">✕</button>
		</form>
		{#each abilities as ability (ability.name)}
			<label class="form-control mt-3 w-full">
				<details class="collapse collapse-arrow textarea-bordered border bg-base-200">
					<summary class="collapse-title capitalize">
						<div
							class:sm:grid-cols-6={!aiConfigState.value?.disableImagesState}
							class:grid-cols-2={!aiConfigState.value?.disableImagesState}
							class:grid-cols-1={aiConfigState.value?.disableImagesState}
							class="grid overflow-hidden overflow-ellipsis text-center"
						>
							{#if !aiConfigState.value?.disableImagesState}
								<div class="m-auto sm:col-span-3">
									<AIGeneratedImage
										noLogo={true}
										enhance={false}
										imageClassesString="w-[90px] sm:w-[100px] h-[90px] sm:h-[100px] m-auto"
										imagePrompt={CharacterStatsAgent.getSpellImagePrompt(
											ability,
											storyImagePrompt
										)}
										showGenerateButton={false}
									></AIGeneratedImage>
								</div>
							{/if}
							<div class="m-auto w-full sm:col-span-2">
								<p class="badge badge-info">{ability.mp_cost} MP</p>
								<p class="mt-2 overflow-hidden overflow-ellipsis">{ability.name}</p>
								<button
									type="button"
									class="components btn btn-neutral no-animation mt-2"
									disabled={ability.mp_cost > 0 && ability.mp_cost > currentMP}
									onclick={() => {
										mapAbilityToAction(ability);
										dialogRef.close();
										targetModalRef.showModal();
									}}
								>
									Cast
								</button>
							</div>
						</div>
					</summary>
					<div class="collapse-content">
						<p class="m-5 mt-2">
							{ability.effect}
						</p>
					</div>
				</details>
			</label>
		{/each}
	</div>
</dialog>
