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

            if (action && action.type === "wait") {
                this.runBotLoop(bot, engine, level);
                return;
            }

            const column = this.chooseBotColumn(
                engine,
                bot.blocks[action.blockIndex]
            );

            engine.placeBlock(
                bot.id,
                action.blockIndex,
                column
            );

            this.runBotLoop(
                bot,
                engine,
                level
            );

        }, delay);

    }

    chooseBotAction(bot, engine, strategy = GameConfig.debugBotStrategy) {
        if (strategy === "mvp_greedy") {
            return this.chooseMvpGreedyAction(bot, engine);
        }

        return this.chooseCooperativeAction(bot, engine);
    }

    chooseBotColumn(engine, block, strategy = GameConfig.debugBotStrategy) {
        if (!block) {
            return engine.getPlaceableColumnRange().min;
        }

        const { min, max } = engine.getPlaceableOriginRange(block);
        const greedy = strategy === "mvp_greedy";
        const previousHeight = TowerStability.topHeight(
            engine.room.towerBlocks || []
        );
        const options = [];

        for (let column = min; column <= max; column++) {
            const originX = engine.resolveColumnOriginX(block, column);
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
            const heightGain = Math.max(
                0,
                TowerStability.topHeight(projected) - previousHeight
            );

            if (result.stability <= 0) {
                continue;
            }

            options.push({
                column: column,
                stability: result.stability,
                heightGain: heightGain
            });
        }

        if (options.length === 0) {
            return min;
        }

        // Gate cooperative play on how much stability the *best available*
        // column offers rather than a fixed threshold: an absolute cut-off stops
        // discriminating entirely once the stability config is tuned forgiving
        // enough that every column reads healthy.
        const bestStability = options.reduce((top, option) => {
            return Math.max(top, option.stability);
        }, 0);
        const tolerance = Math.max(
            0,
            Number(GameConfig.debugBotStabilityTolerance) || 0
        );
        const allowed = greedy
            ? options
            : options.filter(option => {
                return option.stability >= bestStability - tolerance;
            });

        return allowed.reduce((best, option) => {
            if (!best) {
                return option;
            }

            if (option.heightGain !== best.heightGain) {
                return option.heightGain > best.heightGain ? option : best;
            }

            return option.stability > best.stability ? option : best;
        }, null).column;
    }

    // True when this bot has already banked its own Impact share for the level
    // while a teammate is still short of theirs. Under an Impact-every-level
    // setup, continuing to claim height there is what fails the whole team, so a
    // cooperative bot yields and a greedy one deliberately does not.
    hasClearedShareWhileTeammateShort(bot, engine) {
        const status = engine.getImpactScoreStatus();

        if (!status || status.requiredBandScore <= 0) {
            return false;
        }

        // getImpactScoreStatus reads banked `score`, which only absorbs
        // `levelScore` once the level completes -- mid-level every player would
        // otherwise read as short. Add the live level score the same way the
        // client's Impact bar does.
        const liveBandScore = player => {
            const banked = Number(
                status.players.find(entry => entry.id === player.id)?.bandScore || 0
            );

            return banked + Number(player.levelScore || 0);
        };
        const required = Number(status.requiredBandScore);
        const self = engine.room.players.find(player => player.id === bot.id);

        if (!self || liveBandScore(self) < required) {
            return false;
        }

        return engine.room.players.some(player => {
            return player.id !== bot.id && liveBandScore(player) < required;
        });
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

        const yieldHeight = this.hasClearedShareWhileTeammateShort(bot, engine);

        // Already banked its own share while a teammate is short: the height
        // left in this level is worth more to them than to this bot, and under
        // an Impact-every-level rule their shortfall fails the whole team. Hold
        // the turn rather than consume it. The teammate who is short can never
        // take this branch, so the room cannot deadlock.
        if (yieldHeight && remainingHeight > 0) {
            return { type: "wait" };
        }

        const nonOverkill = candidates.filter(candidate => {
            return candidate.height <= remainingHeight;
        });

        if (nonOverkill.length > 0) {
            const sorted = nonOverkill.sort((a, b) => {
                if (yieldHeight || remainingHeight <= 3) {
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
