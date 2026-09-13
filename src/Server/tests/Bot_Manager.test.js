const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const BotManager = require("../app/Bot_Manager");
const { GameConfig, resetFixtures } = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

test("bot reaction delays stay within the configured three-to-four-second band", () => {
    GameConfig.debugBotDelayMin = 3000;
    GameConfig.debugBotDelayMax = 4000;
    const originalRandom = Math.random;

    try {
        for (const randomValue of [0, 0.999999]) {
            Math.random = () => randomValue;
            assert.equal(
                BotManager.getReactionDelay({}),
                randomValue === 0 ? 3000 : 4000
            );

            const profiles = [
                ...BotManager.getDefaultBotProfiles(),
                { personality: "climber", reactionMs: 250 },
                { personality: "engineer", reactionMs: 10000 }
            ];
            for (const profile of profiles) {
                const delay = BotManager.getReactionDelay({ botProfile: profile });
                assert.ok(delay >= 3000, `${profile.personality} delay must respect the minimum`);
                assert.ok(delay <= 4000, `${profile.personality} delay must respect the maximum`);
            }
        }
    } finally {
        Math.random = originalRandom;
    }
});
