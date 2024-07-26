import {handleError, stringifyPretty} from "$lib/util.svelte.ts";
import {GeminiProvider} from "../llmProvider";



export const storyStateForPrompt = {
    game: "Any Pen & Paper System e.g. Pathfinder, Call of Cthulhu, Star Wars, Fate Core, World of Darkness, GURPS, Mutants & Masterminds, Dungeons & Dragons",
    adventure_and_main_event: "Generate a random adventure with a random main story line. It does not have to be a quest, it can also be an event. It should be extraordinary and not cliche.",
    theme: "THEME of the story telling, e.g. world the story is located in",
    tonality: "TONALITY of the story telling, writing style, must fit GAME system",
    character: "Generate a random character fitting the GAME system in ADVENTURE_AND_MAIN_EVENT",
    general_image_prompt: "Create a general system prompt max 10 words for this adventure to add to every image that is generated by an ai. Can be art style etc.",
};

export class StoryAgent {

    llmProvider: GeminiProvider;

    constructor(llmProvider: GeminiProvider) {
        this.llmProvider = llmProvider;
    }


    async generateRandomStorySettings(overwrites) {
        let storyAgent = "You are RPG story agent, crafting captivating, limitless GAME experiences using BOOKS, THEME, TONALITY for CHARACTER.\n" +
            "Always respond with following JSON!\n" +
            stringifyPretty(storyStateForPrompt);

        let preset = {
            ...storyStateForPrompt,
            ...overwrites,
        }
        const jsonText = await this.llmProvider.sendToAI(
            [{
                "role": "user",
                "parts": [{"text": "Create a new randomized story setting with following already set: " + stringifyPretty(preset)}]
            }],
            storyAgent
        );
        try {
            if (jsonText) {
                return JSON.parse(jsonText);
            }
        } catch (e) {
            handleError(e);

        }
        return undefined;
    }

}
