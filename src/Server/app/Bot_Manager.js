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

    // Release-row candidates for one placement decision: `null` (drop from
    // above, the pre-gap-targeting behavior) plus up to `debugBotGapCandidates`
    // void floors, largest-void-first. A void is a run of empty cells in one
    // column with an occupied cell sitting on top of it -- an open column top
    // is not a void, it is already covered by the `null` candidate. Computed
    // once per decision and tried against every column, rather than searched
    // per column, so cost is bounded by tower shape rather than tower height.
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

        // row -> largest void run found starting at that row, across columns.
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
            // A run still open at topHeight has no lid -- it is the open top
            // of that column, not a void, so it is deliberately dropped here.
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

    // Ranks a list of `{ points, heightGain, stability, ... }` candidates by
    // strategy, preserving *risk appetite, not competence* -- see
    // gameplay.md#bot-behavior. Used both to pick a placement for one brick and
    // to pick a brick from a hand, so a cooperative bot is equally
    // stability-averse at both stages.
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

        // Cooperative: gate on how much stability the *best available*
        // candidate offers rather than a fixed threshold -- an absolute cutoff
        // stops discriminating once the stability config is tuned forgiving
        // enough that every candidate reads healthy.
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

    // Chooses where to place one brick, searching every column crossed with
    // every release-row candidate (drop-from-above plus up to
    // debugBotGapCandidates void floors). Two-stage: a cheap proxy pass (no
    // evaluate()) narrows to the top 8 candidates, then only those survivors
    // pay for a full TowerStability.evaluate() and get scored with the engine's
    // own placement/reinforce reward formulas -- so ranking reflects what the
    // engine will actually pay, not a stand-in. Returns
    // { column, originX, originY, heightGain, stability, points } or null if
    // every candidate collapses the tower.
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
        const perSupportedCell =
            Number(GameConfig.scoring.reinforceScorePerSupportedCell) || 0;

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
                const proxy =
                    effectiveHeight * perHeight +
                    supportedCells * perSupportedCell;

                cheapCandidates.push({
                    column: column,
                    originX: placement.originX,
                    originY: placement.originY,
                    heightGain: heightGain,
                    effectiveHeight: effectiveHeight,
                    supportedCells: supportedCells,
                    proxy: proxy,
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

        const stabilityBefore = engine.room.towerStability ?? 100;
        const structureBefore = engine.room.towerStabilityDiagnostics || {};
        const stabilityConfig = engine.resolveStabilityConfig();
        const placementMultiplier =
            engine.getPlacementStabilityMultiplier(stabilityBefore);
        const reinforceCap = engine.getReinforceScoreCap();
        const level = engine.room.level;
        const perIntegrity =
            Number(GameConfig.scoring.reinforceScorePerIntegrity) || 0;
        const perLean = Number(GameConfig.scoring.reinforceScorePerLean) || 0;

        const scored = [];

        for (const candidate of survivors) {
            const result = TowerStability.evaluate(candidate.projected, stabilityConfig);

            if (result.stability <= 0) {
                continue;
            }

            const integrityGain = Math.max(
                0,
                Number(result.diagnostics.integrity ?? 100) -
                    Number(structureBefore.integrity ?? 100)
            );
            const leanCorrection = Math.max(
                0,
                Math.abs(Number(structureBefore.tiltScore) || 0) -
                    Math.abs(Number(result.diagnostics.tiltScore) || 0)
            );
            const placementPoints = Math.round(
                candidate.effectiveHeight * level * perHeight * placementMultiplier
            );
            const reinforcePoints = Math.min(
                reinforceCap,
                Math.round(
                    (integrityGain * perIntegrity +
                        leanCorrection * perLean +
                        candidate.supportedCells * perSupportedCell) *
                    level
                )
            );

            scored.push({
                column: candidate.column,
                originX: candidate.originX,
                originY: candidate.originY,
                heightGain: candidate.heightGain,
                stability: result.stability,
                points: placementPoints + reinforcePoints
            });
        }

        return this.rankByStrategy(scored, strategy);
    }

    // Joins brick choice to placement choice: under gap targeting a 1-high
    // brick can be worth more as a repair than a 4-high brick is as a claim, so
    // brick and placement can no longer be picked independently. Evaluates the
    // cross product of hand (<= 3 bricks) x best placement per brick and
    // returns the best pair, after the cheap exact-finisher shortcut.
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

        // Cooperative only: already banked its own share while a teammate is
        // short, so the height left in this level is worth more to them than
        // to this bot, and under an Impact-every-level rule their shortfall
        // fails the whole team. A zero-height repair still leaves every point
        // of contested height to the short teammate while doing something
        // useful, so prefer the best one over holding the turn outright. The
        // teammate who is short can never take this branch, so the room
        // cannot deadlock.
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
