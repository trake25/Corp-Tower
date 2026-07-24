const GameConfig =
    require("./Game_Config");
const TowerStability =
    require("./Tower_Stability");

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

            const action = this.chooseBotAction(bot, engine);
            const lane = this.chooseBotLane(
                engine,
                bot.blocks[action.blockIndex]
            );

            engine.placeBlock(
                bot.id,
                action.blockIndex,
                lane
            );

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

    chooseBotLane(engine, block) {
        if (!block) {
            return "center";
        }

        const lanes = Object.keys(
            GameConfig.placeableLanes || { left: 1, center: 2, right: 3 }
        );
        let best = null;

        lanes.forEach(lane => {
            const originX = engine.resolveLaneOriginX(block, lane);
            const placement = TowerStability.settleBlock(
                engine.room.towerBlocks || [],
                block,
                originX
            );
            const projected = [
                ...(engine.room.towerBlocks || []),
                {
                    block: block,
                    originX: placement.originX,
                    originY: placement.originY
                }
            ];
            const result = TowerStability.evaluate(projected, GameConfig);

            if (!best || result.stability > best.stability) {
                best = { lane: lane, stability: result.stability };
            }
        });

        return best ? best.lane : "center";
    }

    chooseCooperativeAction(bot, engine) {

        const remainingHeight = Math.max(
            0,
            engine.room.targetHeight - engine.room.currentHeight
        );
        const blocks = bot.blocks || [];

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

}

module.exports =
    new BotManager();
