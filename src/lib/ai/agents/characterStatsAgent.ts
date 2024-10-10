import {stringifyPretty} from "$lib/util.svelte";
import type {LLM, LLMMessage, LLMRequest} from "$lib/ai/llm";
import type {CharacterDescription} from "$lib/ai/agents/characterAgent";

export type Ability = { name: string, effect: string, mp_cost: string }
export const abilityFormat = '{"name": "", "effect": "Clearly state the effect caused. If causing damage include a notation like 2d6", "mp_cost": integer}'

export type CharacterStats = typeof characterStatsStateForPrompt;
export const characterStatsStateForPrompt = {
    resources: 'Starting maximum HP and MP in range 20 - 100, based on overall description of the character. Format: {"MAX_HP": startingHP, "MAX_MP": startingMP}',
    traits: 'list of the beginning traits of the character in following format: {"trait1": startingValue1, "trait2": startingValue2, ...}',
    expertise: 'Traits where CHARACTER has a high value and a positive dice roll modifier format: {"trait1": value between 1-5, "trait2": 1-5, ...}',
    disadvantages: 'Traits where CHARACTER has a low value and a negative dice roll modifier format: {"trait1": value between -1 to -5, "trait2": -1 to -5, ...}',
    spells_and_abilities: `Array of spells and abilities. List 2-4 actively usable spells and abilities. At last include a 'Standard Attack'. Format: [${abilityFormat}]`,
}

export const npcRank = [
    "Very Weak",
    "Weak",
    "Average",
    "Strong",
    "Boss",
    "Legendary"
]

export type NPC = {uniqueNpcName: NPCStats}
export type NPCStats = typeof npcStatsStateForPrompt;
export const npcStatsStateForPrompt = {
    class: "",
    rank: "Power ranking of the NPC. Can be one of " + npcRank.join('|'),
    spells_and_abilities: characterStatsStateForPrompt.spells_and_abilities
}

export class CharacterStatsAgent {

    llm: LLM;

    constructor(llm: LLM) {
        this.llm = llm;
    }

    async generateCharacterStats(storyState: any, characterState: CharacterDescription, statsOverwrites: Partial<CharacterStats> | undefined = undefined) : Promise<CharacterStats> {
        const agentInstruction = "You are RPG character stats agent, generating the starting stats for a character according to game system, adventure and character description.\n" +
            "Always respond with following JSON!\n" +
            stringifyPretty(characterStatsStateForPrompt);

        const request: LLMRequest = {
            userMessage: "Create the character according to the descriptions and existing stats",
            historyMessages: [
                {
                    role: "user",
                    content: "Description of the story: " + stringifyPretty(storyState)
                },
                {
                    role: "user",
                    content: "Description of the character: " + stringifyPretty(characterState)
                },
            ],
            systemInstruction: agentInstruction
        }
        if (statsOverwrites) {
            request.historyMessages?.push({
                role: "user",
                content: "Already existing stats to be reused: " + stringifyPretty(statsOverwrites)
            })
        }
        return await this.llm.generateContent(request) as CharacterStats;
    }

    async generateNPCStats(storyState: any, historyMessages: LLMMessage[], npcsToGenerate: Array<string>, customSystemInstruction: string) : Promise<Array<NPC>> {
        const latestHistoryTextOnly = historyMessages.map((m: LLMMessage) => m.content).join("\n");
        const agent = [
            "You are RPG NPC stats agent, generating the stats for a NPC according to game system, adventure and story progression.",
            "Description of the adventure: " + stringifyPretty(storyState),
            "Latest story progression:\n" + latestHistoryTextOnly,
            `Most important instruction! You must always respond with following JSON format! 
                            [{"uniqueNpcName": ${stringifyPretty(npcStatsStateForPrompt)}}, ...]`,
        ];
        if (customSystemInstruction) {
            agent.push(customSystemInstruction);
        }
        const action = "Generate the following NPCs. You must reuse the names given: " + stringifyPretty(npcsToGenerate);
        const request: LLMRequest = {
            userMessage: action,
            systemInstruction: agent
        }
        return await this.llm.generateContent(request) as Array<NPC>;
    }

    async generateSingleAbility(storyState: any, characterState: CharacterDescription, characterStats: CharacterStats, ability: Ability) : Promise<Ability> {
        const agentInstruction = "You are RPG character stats agent, generating a single new ability for a character according to game system, adventure and character description.\n" +
            "Important instruction! The new ability must be based on the following: " + stringifyPretty(ability) + "\n" +
            "Always respond with following JSON!\n" +
            abilityFormat;

        const request: LLMRequest = {
            userMessage: "Important! The new ability must be based on the following: " + stringifyPretty(ability),
            historyMessages: [{
                role: "user",
                content: "Description of the story: " + stringifyPretty(storyState)
            },
                {
                    role: "user",
                    content: "Description of the character: " + stringifyPretty(characterState)
                },
                {
                    role: "user",
                    content: "Stats of the character: " + stringifyPretty(characterStats)
                }],
            systemInstruction: agentInstruction
        }
        return await this.llm.generateContent(request) as Ability;
    }

}
