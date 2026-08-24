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

            if (action.type === "wait") {
                this.runBotLoop(bot, engine, level);
                return;
            }

            engine.placeBlock(
                bot.id,
                action.blockIndex,
                action.column,
                action.originY
            );

            this.runBotLoop(
                bot,
                engine,
                level
            );

        }, delay);

    }

    hasClearedShareWhileTeammateShort(bot, engine) {
        const status = engine.getImpactScoreStatus();

        if (!status || status.requiredContribution <= 0) {
            return false;
        }

        const self = status.players.find(player => player.id === bot.id);

        if (!self || !self.met) {
            return false;
        }

        return status.players.some(player => {
            return player.id !== bot.id && !player.met;
        });
    }

    getVoidReleaseRows(entries, min, max) {
        const topHeight = TowerStability.topHeight(entries);

        if (topHeight <= 1) {
            return [null];
        }

        const occupiedByColumn = new Map();

        entries.forEach(entry => {
            TowerStability.cellsFor(entry).forEach(cell => {
                if (!occupiedByColumn.has(cell.x)) {
                    occupiedByColumn.set(cell.x, new Set());
                }

                occupiedByColumn.get(cell.x).add(cell.y);
            });
        });

        const runsByRow = new Map();

        for (let x = min; x <= max; x++) {
            const occupiedRows = occupiedByColumn.get(x) || new Set();
            let runStart = null;

            for (let y = 0; y < topHeight; y++) {
                const filled = occupiedRows.has(y);

                if (!filled && runStart === null) {
                    runStart = y;
                    continue;
                }

                if (filled && runStart !== null) {
                    const runLength = y - runStart;

                    runsByRow.set(
                        runStart,
                        Math.max(runsByRow.get(runStart) || 0, runLength)
                    );
                    runStart = null;
                }
            }
        }

        const candidateCount = Math.max(
            0, Number(GameConfig.debugBotGapCandidates) || 0
        );
        const ranked = [...runsByRow.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, candidateCount)
            .map(([row]) => row);

        return [null, ...ranked];
    }

    rankByStrategy(candidates, strategy) {
        if (!candidates || candidates.length === 0) {
            return null;
        }

        if (strategy === "mvp_greedy") {
            return candidates.reduce((best, candidate) => {
                if (!best) {
                    return candidate;
                }

                if (candidate.points !== best.points) {
                    return candidate.points > best.points ? candidate : best;
                }

                if (candidate.heightGain !== best.heightGain) {
                    return candidate.heightGain > best.heightGain ? candidate : best;
                }

                return candidate.stability > best.stability ? candidate : best;
            }, null);
        }

        const bestStability = candidates.reduce((top, candidate) => {
            return Math.max(top, candidate.stability);
        }, 0);
        const tolerance = Math.max(
            0, Number(GameConfig.debugBotStabilityTolerance) || 0
        );
        const allowed = candidates.filter(candidate => {
            return candidate.stability >= bestStability - tolerance;
        });

        return allowed.reduce((best, candidate) => {
            if (!best) {
                return candidate;
            }

            if (candidate.points !== best.points) {
                return candidate.points > best.points ? candidate : best;
            }

            return candidate.stability > best.stability ? candidate : best;
        }, null);
    }

    chooseBotPlacement(engine, block, strategy = GameConfig.debugBotStrategy) {
        if (!block) {
            return null;
        }

        const entries = engine.room.towerBlocks || [];
        const { min, max } = engine.getPlaceableOriginRange(block);
        const previousHeight = TowerStability.topHeight(entries);
        const targetHeight = engine.room.targetHeight;
        const currentHeight = engine.room.currentHeight;
        const releaseRows = this.getVoidReleaseRows(entries, min, max);
        const perHeight = Number(GameConfig.scoring.placementScorePerHeight) || 0;

        const seen = new Set();
        const cheapCandidates = [];

        for (let column = min; column <= max; column++) {
            const originX = engine.resolveColumnOriginX(block, column);

            for (const releaseRow of releaseRows) {
                if (
                    releaseRow !== null &&
                    !TowerStability.isPlacementLegal(entries, block, originX, releaseRow)
                ) {
                    continue;
                }

                const placement = TowerStability.settleBlock(
                    entries, block, originX, releaseRow
                );
                const dedupeKey = `${placement.originX},${placement.originY}`;

                if (seen.has(dedupeKey)) {
                    continue;
                }

                seen.add(dedupeKey);

                const supportedCells = TowerStability.supportedCellsGained(
                    entries, block, placement.originX, placement.originY
                );
                const projected = [
                    ...entries,
                    { block, originX: placement.originX, originY: placement.originY }
                ];
                const heightGain = Math.max(
                    0, TowerStability.topHeight(projected) - previousHeight
                );
                const effectiveHeight = Math.max(
                    0, Math.min(heightGain, targetHeight - currentHeight)
                );
                cheapCandidates.push({
                    column: column,
                    originX: placement.originX,
                    originY: placement.originY,
                    heightGain: heightGain,
                    effectiveHeight: effectiveHeight,
                    proxy: effectiveHeight * perHeight + supportedCells,
                    projected: projected
                });
            }
        }

        if (cheapCandidates.length === 0) {
            return null;
        }

        const survivors = cheapCandidates
            .sort((a, b) => b.proxy - a.proxy)
            .slice(0, 8);

        const stabilityConfig = engine.resolveStabilityConfig();
        const structureBefore = engine.room.towerStabilityResult || TowerStability.evaluate(
            entries, stabilityConfig
        );

        const scored = [];

        for (const candidate of survivors) {
            const result = TowerStability.evaluate(candidate.projected, stabilityConfig);

            if (result.stability <= 0) {
                continue;
            }

            const placedEntry = candidate.projected[candidate.projected.length - 1];
            const transaction = engine.previewPlacementScore({
                block,
                effectiveHeight: candidate.effectiveHeight,
                placedEntry,
                beforeResult: structureBefore,
                afterResult: result,
                stabilityConfig
            });

            scored.push({
                column: candidate.column,
                originX: candidate.originX,
                originY: candidate.originY,
                heightGain: candidate.heightGain,
                stability: result.stability,
                points: transaction.points
            });
        }

        return this.rankByStrategy(scored, strategy);
    }

    chooseBotAction(bot, engine, strategy = GameConfig.debugBotStrategy) {
        const remainingHeight = Math.max(
            0, engine.room.targetHeight - engine.room.currentHeight
        );
        const blocks = bot.blocks || [];

        const exactIndex = blocks.findIndex(block => {
            return engine.getBlockHeight(block) === remainingHeight;
        });

        if (exactIndex >= 0) {
            const placement = this.chooseBotPlacement(engine, blocks[exactIndex], strategy);

            if (placement) {
                return {
                    type: "place",
                    blockIndex: exactIndex,
                    column: placement.column,
                    originY: placement.originY
                };
            }
        }

        const pairs = [];

        blocks.forEach((block, index) => {
            const placement = this.chooseBotPlacement(engine, block, strategy);

            if (placement) {
                pairs.push({ ...placement, blockIndex: index });
            }
        });

        if (
            strategy !== "mvp_greedy" &&
            remainingHeight > 0 &&
            this.hasClearedShareWhileTeammateShort(bot, engine)
        ) {
            const repairs = pairs.filter(pair => {
                return pair.heightGain === 0 && pair.points > 0;
            });
            const bestRepair = this.rankByStrategy(repairs, strategy);

            if (bestRepair) {
                return {
                    type: "place",
                    blockIndex: bestRepair.blockIndex,
                    column: bestRepair.column,
                    originY: bestRepair.originY
                };
            }

            return { type: "wait" };
        }

        const best = this.rankByStrategy(pairs, strategy);

        if (!best) {
            return { type: "wait" };
        }

        return {
            type: "place",
            blockIndex: best.blockIndex,
            column: best.column,
            originY: best.originY
        };
    }

}

module.exports =
    new BotManager();
