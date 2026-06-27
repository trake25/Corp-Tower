// Bot_Manager.js

const GameConfig =
    require("./Game_Config");

class BotManager {

    startBots(engine) {

        this.stopBots(engine);

        if (
            !GameConfig.debugBotsEnabled
        ) {
            return;
        }

        engine.room.players
            .forEach(player => {

                if (
                    !player.isBot
                ) {
                    return;
                }

                player.botLoopLevel = engine.room.level;

                this.runBotLoop(
                    player,
                    engine,
                    engine.room.level
                );

            });
    }

    stopBots(engine) {

        if (
            !engine.room
        ) {
            return;
        }

        engine.room.players
            .forEach(player => {

                if (
                    !player.isBot
                ) {
                    return;
                }

                this.stopBot(player);

            });
    }


    stopBot(bot) {

        if (
            bot.botTimer
        ) {
            clearTimeout(
                bot.botTimer
            );
        }

        bot.botTimer = null;
        bot.botLoopLevel = null;
    }


    runBotLoop(
        bot,
        engine,
        level
    ) {

        const delay =

            Math.floor(

                Math.random()

                *

                (
                    GameConfig
                        .debugBotDelayMax

                    -

                    GameConfig
                        .debugBotDelayMin
                )

            )

            +

            GameConfig
                .debugBotDelayMin;


        bot.botTimer = setTimeout(() => {

            bot.botTimer = null;

            if (!engine.room) {
                return;
            }

            if (
                !GameConfig.debugBotsEnabled
            ) {
                return;
            }

            if (
                engine.room.state
                !== "playing"
            ) {
                return;
            }

            if (
                engine.room.level !== level ||
                bot.botLoopLevel !== level
            ) {
                return;
            }

            if (
                !bot.blocks
                ||
                bot.blocks.length
                === 0
            ) {
                return;
            }

            console.log(
                `${bot.id} BOT PLAY`
            );

            const action = this.chooseBotAction(bot, engine);

            if (action.type === "refresh") {
                engine.refreshBlocks(bot.id);
            } else {
                engine.placeBlock(
                    bot.id,
                    action.blockIndex
                );
            }

            this.runBotLoop(
                bot,
                engine,
                level
            );

        }, delay);

    }

    chooseBotAction(bot, engine) {
        if (GameConfig.debugBotStrategy === "mvp_greedy") {
            return this.chooseMvpGreedyAction(bot, engine);
        }

        return this.chooseCooperativeAction(bot, engine);
    }

    chooseCooperativeAction(bot, engine) {

        const remainingHeight = Math.max(
            0,
            engine.room.targetHeight - engine.room.currentHeight
        );
        const blocks = bot.blocks || [];
        const inventoryHeight = this.getInventoryHeight(bot, engine);

        if (
            remainingHeight > 0 &&
            this.canBotRefresh(bot, engine) &&
            remainingHeight > GameConfig.botRefreshLowInventoryHeight &&
            inventoryHeight < GameConfig.botRefreshLowInventoryHeight
        ) {
            return {
                type: "refresh"
            };
        }

        const exactIndex = blocks.findIndex(block => {
            return engine.getBlockHeight(block) === remainingHeight;
        });

        if (exactIndex >= 0) {
            return {
                type: "place",
                blockIndex: exactIndex
            };
        }

        const candidates = blocks
            .map((block, index) => ({
                index: index,
                height: engine.getBlockHeight(block)
            }))
            .filter(candidate => candidate.height > 0);

        const nonOverkill = candidates.filter(candidate => {
            return candidate.height <= remainingHeight;
        });

        if (nonOverkill.length > 0) {
            const sorted = nonOverkill.sort((a, b) => {
                if (remainingHeight <= 3) {
                    return a.height - b.height;
                }

                return b.height - a.height;
            });

            return {
                type: "place",
                blockIndex: sorted[0].index
            };
        }

        const smallestOverkill = candidates.sort((a, b) => {
            return a.height - b.height;
        })[0];

        return {
            type: "place",
            blockIndex: smallestOverkill ? smallestOverkill.index : 0
        };
    }

    chooseMvpGreedyAction(bot, engine) {

        const remainingHeight = Math.max(
            0,
            engine.room.targetHeight - engine.room.currentHeight
        );
        const blocks = bot.blocks || [];
        const candidates = this.getBlockCandidates(blocks, engine);

        const exactIndex = candidates.find(candidate => {
            return candidate.height === remainingHeight;
        })?.index;

        if (exactIndex !== undefined) {
            return {
                type: "place",
                blockIndex: exactIndex
            };
        }

        const usefulCandidates = candidates.filter(candidate => {
            return candidate.effectiveHeight > 0;
        });

        if (usefulCandidates.length > 0) {
            const bestCandidate = usefulCandidates.sort((a, b) => {
                const scoreDiff = b.effectiveHeight - a.effectiveHeight;

                if (scoreDiff !== 0) {
                    return scoreDiff;
                }

                return b.height - a.height;
            })[0];

            return {
                type: "place",
                blockIndex: bestCandidate.index
            };
        }

        if (
            this.canBotRefresh(bot, engine) &&
            this.getInventoryHeight(bot, engine) <
                GameConfig.botRefreshLowInventoryHeight
        ) {
            return {
                type: "refresh"
            };
        }

        const largestBlock = candidates.sort((a, b) => {
            return b.height - a.height;
        })[0];

        return {
            type: "place",
            blockIndex: largestBlock ? largestBlock.index : 0
        };
    }

    getBlockCandidates(blocks, engine) {

        const remainingHeight = Math.max(
            0,
            engine.room.targetHeight - engine.room.currentHeight
        );

        return (blocks || [])
            .map((block, index) => {
                const height = engine.getBlockHeight(block);

                return {
                    index: index,
                    height: height,
                    effectiveHeight: Math.max(
                        0,
                        Math.min(height, remainingHeight)
                    )
                };
            })
            .filter(candidate => candidate.height > 0);
    }

    getInventoryHeight(bot, engine) {

        return (bot.blocks || []).reduce((total, block) => {
            return total + engine.getBlockHeight(block);
        }, 0);
    }

    canBotRefresh(bot, engine) {

        return (
            bot.refreshTokens > 0 &&
            bot.refreshUsesThisLevel < GameConfig.maxRefreshUsesPerLevel &&
            engine.getRemainingMs() > GameConfig.refreshLockoutMs
        );
    }

}

module.exports =
    new BotManager();
