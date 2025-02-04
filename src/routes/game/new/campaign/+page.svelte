<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingModal from '$lib/components/LoadingModal.svelte';
	import { useLocalStorage } from '$lib/state/useLocalStorage.svelte';
	import { LLMProvider } from '$lib/ai/llmProvider';
	import {
		getRowsForTextarea,
		loadPDF,
		navigate,
		removeEmptyValues,
		stringifyPretty
	} from '$lib/util.svelte';
	import isEqual from 'lodash.isequal';
	import ImportExportSaveGame from '$lib/components/ImportExportSaveGame.svelte';
	import { type CharacterDescription, initialCharacterState } from '$lib/ai/agents/characterAgent';
	import {
		type Campaign,
		CampaignAgent,
		type CampaignChapter,
		getNewChapterObject,
		getNewPlotPointObject,
		initialCampaignState
	} from '$lib/ai/agents/campaignAgent';
	import { type Story, StoryAgent } from '$lib/ai/agents/storyAgent';

	let isGeneratingState = $state(false);
	const apiKeyState = useLocalStorage<string>('apiKeyState');
	const aiLanguage = useLocalStorage<string>('aiLanguage');
	let campaignAgent: CampaignAgent;
	let storyAgent: StoryAgent;

	const campaignState = useLocalStorage<Campaign>('campaignState', initialCampaignState);
	const storyState = useLocalStorage<Story>('storyState');
	const currentChapterState = useLocalStorage<number>('currentChapterState');
	const textAreaRowsDerived = $derived(getRowsForTextarea(campaignState.value));
	let campaignStateOverwrites = $state({});
	const characterState = useLocalStorage<CharacterDescription>('characterState');

	onMount(() => {
		campaignAgent = new CampaignAgent(
			LLMProvider.provideLLM({
				temperature: 2,
				apiKey: apiKeyState.value,
				language: aiLanguage.value
			})
		);
		storyAgent = new StoryAgent(
			LLMProvider.provideLLM({
				temperature: 2,
				apiKey: apiKeyState.value,
				language: aiLanguage.value
			})
		);

		if (
			campaignState.value?.chapters &&
			campaignState.value?.chapters.length > 0 &&
			campaignState.value?.chapters[0].plot_points?.length > 0
		) {
			const firstChapter: CampaignChapter = $state.snapshot(campaignState.value.chapters[0]);
			firstChapter.plot_points.push({
				...campaignState.value.chapters[firstChapter.chapterId]?.plot_points[0],
				plotId: firstChapter.plot_points.length + 1
			});
			storyState.value = {
				...storyState.value,
				adventure_and_main_event: stringifyPretty(firstChapter)
			};
		}
	});

	function onUploadClicked() {
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = 'application/pdf';
		fileInput.click();
		fileInput.addEventListener('change', function (event) {
			// @ts-expect-error can never be null
			const file = event.target.files[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = async () => {
					const text = await loadPDF(file);
					campaignStateOverwrites = { ...campaignStateOverwrites, gameBook: text };
					await onRandomize();
				};
				reader.readAsArrayBuffer(file);
			}
		});
	}

	function getCharacterDescription() {
		let characterDescription = $state.snapshot(characterState.value);
		if (isEqual(characterDescription, initialCharacterState)) {
			return undefined;
		}
		return characterDescription;
	}

	const generateStory = async () => {
		isGeneratingState = true;
		const firstChapter: CampaignChapter = $state.snapshot(campaignState.value.chapters[0]);
		//chapterId is actually next chapter as it starts with 1
		firstChapter.plot_points.push({
			...campaignState.value.chapters[firstChapter.chapterId]?.plot_points[0],
			plotId: firstChapter.plot_points.length + 1
		});

		const overwrites: Partial<Story> = {
			game: campaignState.value.game,
			adventure_and_main_event: stringifyPretty(firstChapter),
			world_details: campaignState.value.world_details,
			character_simple_description: campaignState.value.character_simple_description
		};
		const newState = await storyAgent.generateRandomStorySettings(overwrites);
		if (newState) {
			newState.adventure_and_main_event = stringifyPretty(firstChapter);
			console.log(stringifyPretty(newState));
			storyState.value = newState;
		}
		currentChapterState.value = 1;
		isGeneratingState = false;
		return newState;
	};
	const onRandomize = async () => {
		isGeneratingState = true;

		const newState = await campaignAgent.generateCampaign(
			$state.snapshot(campaignStateOverwrites),
			getCharacterDescription()
		);
		if (newState) {
			console.log(stringifyPretty(newState));
			campaignState.value = newState;
		}
		isGeneratingState = false;
	};

	const onRandomizeSingle = async (stateValue: string, chapterNumber: string = '') => {
		isGeneratingState = true;
		const currentCampaign = $state.snapshot(campaignState.value);
		if (chapterNumber) {
			currentCampaign[stateValue][chapterNumber] = undefined;
		} else {
			currentCampaign[stateValue] = undefined;
		}
		const filteredOverwrites: Campaign = removeEmptyValues(
			$state.snapshot(campaignStateOverwrites)
		) as Campaign;
		const singleChapterOverwritten =
			filteredOverwrites.chapters && filteredOverwrites.chapters[chapterNumber];
		//TODO not generic
		if (filteredOverwrites.chapters) {
			filteredOverwrites.chapters = Object.entries(
				removeEmptyValues(filteredOverwrites.chapters)
			).map(
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				([_, value]) => value
			);
		}

		let alteredCampaign = { ...currentCampaign, ...filteredOverwrites };
		if (chapterNumber) {
			// TODO only works for chapters section
			const newChapter = await campaignAgent.generateSingleChapter(
				alteredCampaign,
				$state.snapshot(characterState.value),
				Number.parseInt(chapterNumber) + 1,
				singleChapterOverwritten
			);
			campaignState.value[stateValue][chapterNumber] = newChapter;
		} else {
			const newState = await campaignAgent.generateCampaign(
				alteredCampaign,
				$state.snapshot(characterState.value)
			);
			if (newState) {
				console.log(stringifyPretty(newState));
				campaignState.value[stateValue] = newState[stateValue];
			}
		}
		isGeneratingState = false;
	};

	function handleInput(evt, stateValue) {
		campaignStateOverwrites[stateValue] = evt.target.value;
	}

	function isCampaignSet() {
		return campaignState.value?.chapters?.length > 0;
	}

	async function _goto(page: string) {
		if (!isEqual(initialCampaignState, campaignState.value)) {
			if (!isCampaignSet()) {
				await onRandomize();
			}
			if(await generateStory()){
				navigate('/new/' + page);
			}
		}else{
			navigate('/new/' + page);
		}
	}
</script>

{#if isGeneratingState}
	<LoadingModal />
{/if}
<ul class="steps mt-3 w-full">
	<li class="step step-primary">Campaign</li>
	<!--TODO  -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events  -->
	<li class="step cursor-pointer" onclick={() => _goto('character')}>Character</li>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions  -->
	<!-- svelte-ignore a11y_click_events_have_key_events  -->
	<li class="step cursor-pointer" onclick={() => _goto('characterStats')}>Stats</li>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions  -->
	<!-- svelte-ignore a11y_click_events_have_key_events  -->
	<li class="step cursor-pointer" onclick={() => _goto('character')}>Start</li>
</ul>
<form class="m-6 grid items-center gap-2 text-center">
	<button
		class="btn btn-accent m-auto mt-3 w-3/4 sm:w-1/2"
		disabled={isGeneratingState}
		onclick={onRandomize}
	>
		Randomize All
	</button>
	<button class="btn btn-neutral m-auto w-3/4 sm:w-1/2" onclick={onUploadClicked}>
		Generate Campaign from PDF
	</button>
	<button
		class="btn btn-neutral m-auto w-3/4 sm:w-1/2"
		onclick={() => {
			campaignState.reset();
			storyState.reset();
			campaignStateOverwrites = {};
		}}
	>
		Clear All
	</button>
	<ImportExportSaveGame isSaveGame={false}>
		{#snippet exportButton(onclick)}
			<button {onclick} class="btn btn-neutral m-auto w-3/4 sm:w-1/2"> Export Settings</button>
		{/snippet}
		{#snippet importButton(onclick)}
			<button {onclick} class="btn btn-neutral m-auto w-3/4 sm:w-1/2"> Import Settings</button>
		{/snippet}
	</ImportExportSaveGame>
	<button
		class="btn btn-primary m-auto w-3/4 sm:w-1/2"
		disabled={!isCampaignSet()}
		onclick={() => _goto('character')}
	>
		Next Step:<br /> Customize Character
	</button>
	{#if campaignState.value}
		{#each Object.keys(initialCampaignState) as stateValue}
			{#if stateValue === 'chapters'}
				<!-- TODO refactor or leave for now?-->
				<label class="form-control mt-3 w-full">
					<details class="collapse collapse-arrow border border-base-300 bg-base-200">
						<summary class="collapse-title capitalize">{stateValue.replaceAll('_', ' ')}</summary>
						<div class="collapse-content">
							{#each Object.keys(campaignState.value[stateValue]) as chapterNumber}
								<label class="form-control mt-3 w-full">
									<details class="collapse collapse-arrow textarea-bordered border bg-base-200">
										{#each Object.keys(campaignState.value[stateValue][chapterNumber]) as chapterProperty (chapterProperty)}
											{#if chapterProperty === 'plot_points'}
												<details class="collapse collapse-arrow border border-base-300 bg-base-200">
													<summary class="collapse-title capitalize"
														>{chapterProperty.replaceAll('_', ' ')}</summary
													>
													<div class="collapse-content">
														{#each Object.keys(campaignState.value[stateValue][chapterNumber][chapterProperty]) as plotPoint}
															<label class="form-control mt-3 w-full">
																<details
																	class="collapse collapse-arrow textarea-bordered border bg-base-200"
																>
																	{#each Object.keys(campaignState.value[stateValue][chapterNumber][chapterProperty][plotPoint]) as plotPointProperty (plotPointProperty)}
																		{#if plotPointProperty === 'location'}
																			<summary class="collapse-title capitalize">
																				<div class="m-auto w-full sm:col-span-2">
																					<p
																						class="content-center overflow-hidden overflow-ellipsis"
																					>
																						{`${campaignState.value[stateValue][chapterNumber][chapterProperty][plotPoint][plotPointProperty] || 'Enter A Name'}`}
																					</p>
																					<button
																						class="components btn btn-error no-animation btn-sm m-auto mt-2"
																						onclick={(evt) => {
																							evt.preventDefault();
																							campaignState.value[stateValue][chapterNumber][
																								chapterProperty
																							].splice(Number.parseInt(plotPoint), 1);
																							if (
																								campaignStateOverwrites[stateValue] && campaignStateOverwrites[stateValue][chapterNumber][
																									chapterProperty
																								][plotPoint]
																							) {
																								delete campaignStateOverwrites[stateValue][
																									chapterNumber
																								][chapterProperty][plotPoint];
																							}
																							campaignState.value[stateValue][chapterNumber][
																								chapterProperty
																							] = campaignState.value[stateValue][chapterNumber][
																								chapterProperty
																							].map((plotPoint, i) => ({
																								...plotPoint,
																								plotId: i + 1
																							}));
																						}}
																					>
																						Delete
																					</button>
																				</div>
																			</summary>
																		{/if}
																		{#if plotPointProperty !== 'plotId'}
																			<div class="collapse-content">
																				<label class="form-control mt-3 w-full">
																					<div class="capitalize">
																						{plotPointProperty.replaceAll('_', ' ')}
																						{#if campaignStateOverwrites[stateValue] && campaignStateOverwrites[stateValue][chapterNumber] && campaignStateOverwrites[stateValue][chapterNumber][chapterProperty] && campaignStateOverwrites[stateValue][chapterNumber][chapterProperty][plotPoint] && campaignStateOverwrites[stateValue][chapterNumber][chapterProperty][plotPoint][plotPointProperty]}
																							<span class="badge badge-accent ml-2"
																								>overwritten</span
																							>
																						{/if}
																					</div>
																					<textarea
																						bind:value={campaignState.value[stateValue][
																							chapterNumber
																						][chapterProperty][plotPoint][plotPointProperty]}
																						rows={(
																							campaignState.value[stateValue][chapterNumber][
																								chapterProperty
																							][plotPoint][plotPointProperty] + ''
																						).length > 60
																							? 4
																							: 2}
																						oninput={(evt) => {
																							if (!campaignStateOverwrites[stateValue]) {
																								campaignStateOverwrites[stateValue] = {};
																							}
																							if (
																								!campaignStateOverwrites[stateValue][chapterNumber]
																							) {
																								campaignStateOverwrites[stateValue][chapterNumber] =
																									{};
																							}
																							if (
																								!campaignStateOverwrites[stateValue][chapterNumber][
																									chapterProperty
																								]
																							) {
																								campaignStateOverwrites[stateValue][chapterNumber][
																									chapterProperty
																								] = {};
																							}
																							if (
																								!campaignStateOverwrites[stateValue][chapterNumber][
																									chapterProperty
																								][plotPoint]
																							) {
																								campaignStateOverwrites[stateValue][chapterNumber][
																									chapterProperty
																								][plotPoint] = {};
																							}
																							campaignStateOverwrites[stateValue][chapterNumber][
																								chapterProperty
																							][plotPoint][plotPointProperty] = evt.target?.value;
																						}}
																						class="textarea textarea-bordered textarea-md mt-2 w-full"
																					>
																					</textarea>
																				</label>
																			</div>
																		{/if}
																	{/each}
																</details>
															</label>
														{/each}
													</div>
												</details>
												<!-- Plot Points -->
												<button
													class="btn btn-neutral m-auto mt-2 w-3/4 capitalize sm:w-1/2"
													onclick={() => {
														campaignState.value[stateValue][chapterNumber][chapterProperty].push(
															getNewPlotPointObject(
																campaignState.value[stateValue][chapterNumber][chapterProperty]
																	.length + 1
															)
														);
													}}
												>
													Add Plot Point
												</button>
											{:else}
												{#if chapterProperty === 'title'}
													<summary class="collapse-title capitalize">
														<div class="m-auto w-full sm:col-span-2">
															<p class="content-center overflow-hidden overflow-ellipsis">
																{isNaN(parseInt(chapterNumber))
																	? chapterNumber.replaceAll('_', ' ')
																	: `${campaignState.value[stateValue][chapterNumber][chapterProperty] || 'Enter A Name'}`}
															</p>
															<button
																class="components btn btn-error no-animation btn-sm m-auto mt-2"
																onclick={(evt) => {
																	evt.preventDefault();
																	campaignState.value[stateValue].splice(
																		Number.parseInt(chapterNumber),
																		1
																	);
																	if (campaignStateOverwrites[stateValue] && campaignStateOverwrites[stateValue][chapterNumber]) {
																		delete campaignStateOverwrites[stateValue][chapterNumber];
																	}
																	campaignState.value[stateValue] = campaignState.value[
																		stateValue
																	].map((chapter, i) => ({ ...chapter, chapterId: i + 1 }));
																}}
															>
																Delete
															</button>
														</div>
													</summary>
												{/if}
												{#if chapterProperty !== 'chapterId'}
													<div class="collapse-content">
														<label class="form-control mt-3 w-full">
															<div class="capitalize">
																{chapterProperty.replaceAll('_', ' ')}
																{#if campaignStateOverwrites[stateValue] && campaignStateOverwrites[stateValue][chapterNumber] && campaignStateOverwrites[stateValue][chapterNumber][chapterProperty]}
																	<span class="badge badge-accent ml-2">overwritten</span>
																{/if}
															</div>
															<textarea
																bind:value={campaignState.value[stateValue][chapterNumber][
																	chapterProperty
																]}
																rows={campaignState.value[stateValue][chapterNumber][
																	chapterProperty
																]?.length > 30
																	? 2
																	: 1}
																oninput={(evt) => {
																	if (!campaignStateOverwrites[stateValue]) {
																		campaignStateOverwrites[stateValue] = {};
																	}
																	if (!campaignStateOverwrites[stateValue][chapterNumber]) {
																		campaignStateOverwrites[stateValue][chapterNumber] = {};
																	}
																	campaignStateOverwrites[stateValue][chapterNumber][
																		chapterProperty
																	] = evt.target?.value;
																}}
																class="textarea textarea-bordered textarea-md mt-2 w-full"
															>
															</textarea>
														</label>
													</div>
												{/if}
											{/if}
										{/each}
										<button
											class="btn btn-accent m-5 m-auto mb-2 mt-2 w-3/4 sm:w-1/2"
											onclick={() => {
												onRandomizeSingle(stateValue, chapterNumber);
											}}
										>
											Randomize Whole Chapter
										</button>
									</details>
								</label>
							{/each}
							<!-- Chapters -->
						</div>
						<button
							class="btn btn-neutral m-auto mt-2 w-3/4 capitalize sm:w-1/2"
							onclick={() => {
								campaignState.value[stateValue].push(
									getNewChapterObject(campaignState.value[stateValue].length + 1)
								);
							}}
						>
							Add Chapter
						</button>
						<button
							class="btn btn-accent m-5 m-auto mb-2 mt-2 w-3/4 sm:w-1/2"
							onclick={() => {
								onRandomizeSingle(stateValue);
							}}
						>
							Randomize All Chapters
						</button>
					</details>
				</label>
			{:else}
				<label class="form-control mt-3 w-full">
					<div class=" flex-row capitalize">
						{stateValue.replaceAll('_', ' ')}
						{#if campaignStateOverwrites[stateValue]}
							<span class="badge badge-accent ml-2">overwritten</span>
						{/if}
					</div>

					<textarea
						bind:value={campaignState.value[stateValue]}
						rows={textAreaRowsDerived ? textAreaRowsDerived[stateValue] : 2}
						oninput={(evt) => handleInput(evt, stateValue)}
						placeholder={initialCampaignState[stateValue]}
						class="textarea textarea-bordered textarea-md mt-2 w-full"
					></textarea>
				</label>
				<button
					class="btn btn-accent m-auto mt-2 w-3/4 capitalize sm:w-1/2"
					onclick={() => {
						onRandomizeSingle(stateValue);
					}}
				>
					Randomize {stateValue.replaceAll('_', ' ')}
				</button>
				<button
					class="btn btn-neutral m-auto mt-2 w-3/4 capitalize sm:w-1/2"
					onclick={() => {
						campaignState.resetProperty(stateValue);
						delete campaignStateOverwrites[stateValue];
					}}
				>
					Clear {stateValue.replaceAll('_', ' ')}
				</button>
			{/if}
		{/each}
		<button
			class="btn btn-primary m-auto mt-2 w-3/4 sm:w-1/2"
			disabled={!isCampaignSet()}
			onclick={() => _goto('character')}
		>
			Next Step:<br /> Customize Character
		</button>
	{/if}
</form>
