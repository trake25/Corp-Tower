const GameConfig =
    require("./Game_Config");
const TowerStability =
    require("./Tower_Stability");

const MIN_REACTION_MS = 250;
const MAX_REACTION_MS = 10000;
const STANDARD_SHORTLIST_SIZE = 8;
const CRITICAL_RESCUE_SHORTLIST_SIZE = 4;
const CRITICAL_LAST_RESORT_WAITS = Object.freeze({
    engineer: 5,
    climber: 2,
    opportunist: 0
});

const PERSONALITY_DEFAULTS = Object.freeze({
    climber: Object.freeze({
        personality: "climber",
        reactionMs: 1400,
        skill: 0.78,
        riskTolerance: 0.45,
        greed: 0.76,
        repairAwareness: 0.32,
        powerUse: 0.30
    }),
    engineer: Object.freeze({
        personality: "engineer",
        reactionMs: 1750,
        skill: 0.86,
        riskTolerance: 0.16,
        greed: 0.30,
        repairAwareness: 0.90,
        powerUse: 0.46
    }),
    opportunist: Object.freeze({
        personality: "opportunist",
        reactionMs: 1250,
        skill: 0.72,
        riskTolerance: 0.58,
        greed: 0.92,
        repairAwareness: 0.43,
        powerUse: 0.74
    })
});

const LEGACY_PERSONALITIES = Object.freeze({
    cooperative: "engineer",
    mvp_greedy: "opportunist"
});

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
}

function clamp01(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : fallback;
}

function isPersonality(value) {
    return Object.prototype.hasOwnProperty.call(PERSONALITY_DEFAULTS, value);
}

class BotManager {

    /**
     * Returns an exact, match-local profile object.  Keep this as the public
     * entry point for room creation so transport code never needs to know the
     * profile defaults or bounds.
     */
    normalizeBotProfile(profile, fallbackPersonality = "climber") {
        const requested = typeof profile === "string"
            ? profile.toLowerCase()
            : String(profile?.personality || "").toLowerCase();
        const fallback = isPersonality(fallbackPersonality)
            ? fallbackPersonality
            : "climber";
        const personality = isPersonality(requested)
            ? requested
            : LEGACY_PERSONALITIES[requested] || fallback;
        const defaults = PERSONALITY_DEFAULTS[personality];
        const source = profile && typeof profile === "object" ? profile : {};
        const reactionMs = Number(source.reactionMs);

        return {
            personality: personality,
            reactionMs: Number.isFinite(reactionMs)
                ? Math.round(clamp(reactionMs, MIN_REACTION_MS, MAX_REACTION_MS))
                : defaults.reactionMs,
            skill: clamp01(source.skill, defaults.skill),
            riskTolerance: clamp01(source.riskTolerance, defaults.riskTolerance),
            greed: clamp01(source.greed, defaults.greed),
            repairAwareness: clamp01(source.repairAwareness, defaults.repairAwareness),
            powerUse: clamp01(source.powerUse, defaults.powerUse)
        };
    }

    /**
     * Stable default for a three-bot match.  Each call returns new objects so
     * room-local profiles can never mutate a shared configuration value.
     */
    getDefaultBotProfiles() {
        return ["climber", "engineer", "opportunist"].map(personality => {
            return this.normalizeBotProfile(personality);
        });
    }

    isCompleteBotProfile(profile) {
        if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
            return false;
        }

        const personality = typeof profile.personality === "string"
            ? profile.personality.toLowerCase()
            : "";
        const reactionMs = profile.reactionMs;
        const traits = [
            profile.skill,
            profile.riskTolerance,
            profile.greed,
            profile.repairAwareness,
            profile.powerUse
        ];

        return isPersonality(personality) &&
            typeof reactionMs === "number" &&
            Number.isFinite(reactionMs) &&
            Number.isInteger(reactionMs) &&
            reactionMs >= MIN_REACTION_MS &&
            reactionMs <= MAX_REACTION_MS &&
            traits.every(value => {
                return typeof value === "number" &&
                    Number.isFinite(value) &&
                    value >= 0 &&
                    value <= 1;
            });
    }

    /**
     * Strict lineup boundary used by the spectator entry and the simulator.
     * It validates cardinality/personality and normalizes every public trait.
     */
    normalizeBotLineup(profiles, options = {}) {
        if (!Array.isArray(profiles) || profiles.length !== 3) {
            return null;
        }

        const requireCompleteProfiles = Boolean(options.requireCompleteProfiles);
        const normalized = [];

        for (const profile of profiles) {
            if (requireCompleteProfiles && !this.isCompleteBotProfile(profile)) {
                return null;
            }

            const requested = typeof profile === "string"
                ? profile.toLowerCase()
                : String(profile?.personality || "").toLowerCase();

            if (!isPersonality(requested) && !LEGACY_PERSONALITIES[requested]) {
                return null;
            }

            normalized.push(this.normalizeBotProfile(profile));
        }

        return normalized;
    }

    getBotProfile(bot, strategy = GameConfig.debugBotStrategy) {
        if (bot?.botProfile) {
            return this.normalizeBotProfile(bot.botProfile);
        }

        return this.normalizeBotProfile(strategy, "engineer");
    }

    isLegacyStrategy(strategy) {
        return typeof strategy === "string" &&
            Object.prototype.hasOwnProperty.call(LEGACY_PERSONALITIES, strategy);
    }

    getReactionDelay(bot) {
        if (!bot?.botProfile) {
            const min = Math.max(
                MIN_REACTION_MS,
                Math.floor(Number(GameConfig.debugBotDelayMin) || MIN_REACTION_MS)
            );
            const max = Math.max(
                min,
                Math.floor(Number(GameConfig.debugBotDelayMax) || min)
            );

            return min + Math.floor(Math.random() * (max - min + 1));
        }

        const profile = this.getBotProfile(bot);
        const jitter = 0.85 + Math.random() * 0.30;

        return Math.round(profile.reactionMs * jitter);
    }

    startBots(engine) {

        this.stopBots(engine);

        if (
            !GameConfig.debugBotsEnabled &&
            !engine.room?.players?.some(player => player.isBot && player.botProfile)
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

                if (player.botProfile) {
                    player.botProfile = this.normalizeBotProfile(player.botProfile);
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
        bot.criticalRescueWaitState = null;
    }

    runBotLoop(
        bot,
        engine,
        level
    ) {

        const delay = this.getReactionDelay(bot);

        bot.botTimer = setTimeout(() => {

            bot.botTimer = null;

            if (!engine.room) {
                return;
            }

            if (
                !GameConfig.debugBotsEnabled &&
                !bot.botProfile
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

            engine.checkFailCondition();

            if (engine.room.state !== "playing") {
                return;
            }

            if (
                !bot.blocks
                ||
                bot.blocks.length
                === 0
            ) {
                this.runBotLoop(bot, engine, level);
                return;
            }

            const action = this.chooseBotAction(bot, engine);

            if (typeof engine.recordBotDecision === "function" && action.decision) {
                engine.recordBotDecision(bot, action.decision);
            }

            if (action.type === "wait") {
                this.runBotLoop(bot, engine, level);
                return;
            }

            if (action.type === "power") {
                engine.activatePower(bot.id, action.slot);
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

    tryActivateReplenish(engine) {
        for (const bot of engine.room?.players || []) {
            if (!bot.isBot) {
                continue;
            }

            const slot = (bot.powerInventory || []).findIndex(item => {
                return item && item.id === "replenish";
            });

            if (slot >= 0 && engine.activatePower(bot.id, slot)) {
                return true;
            }
        }

        return false;
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

    getPersonalityWeights(profile) {
        if (profile.personality === "climber") {
            return { height: 2.0, reinforce: 0.55, points: 0.7 };
        }

        if (profile.personality === "opportunist") {
            return { height: 1.25, reinforce: 0.7, points: 1.55 };
        }

        return { height: 0.85, reinforce: 1.85, points: 1.0 };
    }

    scoreProfileCandidate(candidate, profile) {
        const weights = this.getPersonalityWeights(profile);
        const stability = Math.max(0, Number(candidate.stability) || 0);
        const instability = Math.max(0, 100 - stability);
        const reinforcement = Number(candidate.structuralPoints || 0) +
            Number(candidate.criticalSavePoints || 0);
        const collapsePenalty = candidate.collapsed
            ? 420 + (1 - profile.riskTolerance) * 1080
            : 0;
        const stabilityWeight = 1.2 + (1 - profile.riskTolerance) * 2.8 +
            profile.repairAwareness * 0.7;
        const noiseRange = 3 + (1 - profile.skill) * 22;
        const noise = (Math.random() - 0.5) * noiseRange;
        const criticalRescueBonus = candidate.criticalRescue
            ? profile.personality === "engineer"
                ? 5000
                : profile.personality === "opportunist"
                    ? 450
                    : 250
            : 0;

        return (
            Number(candidate.points || 0) * (weights.points + profile.greed * 0.55) +
            Number(candidate.heightGain || 0) * weights.height * (5 + profile.greed * 4) +
            reinforcement * weights.reinforce * (0.6 + profile.repairAwareness * 1.4) +
            stability * stabilityWeight -
            instability * (1 - profile.riskTolerance) * 1.8 -
            collapsePenalty +
            criticalRescueBonus +
            noise
        );
    }

    rankByProfile(candidates, profile) {
        if (!candidates || candidates.length === 0) {
            return null;
        }

        const ranked = candidates.map(candidate => {
            return { ...candidate, profileScore: this.scoreProfileCandidate(candidate, profile) };
        }).sort((left, right) => right.profileScore - left.profileScore);
        const safe = ranked.filter(candidate => !candidate.collapsed);
        const collapsed = ranked.filter(candidate => candidate.collapsed);
        let pool = safe.length > 0 ? safe : collapsed;

        // A collapse is a strongly disfavored error, not a bot-only impossibility.
        if (safe.length > 0 && collapsed.length > 0) {
            const unsafeLead = collapsed[0].profileScore - safe[0].profileScore;
            const mistakeChance = (1 - profile.skill) *
                (0.015 + profile.riskTolerance * 0.10);

            if (unsafeLead > 0 && Math.random() < mistakeChance) {
                pool = collapsed;
            }
        }

        const errorChance = (1 - profile.skill) * 0.42;
        const poolSize = Math.min(pool.length, 1 + Math.floor((1 - profile.skill) * 3));

        if (poolSize > 1 && Math.random() < errorChance) {
            return pool[Math.floor(Math.random() * poolSize)];
        }

        return pool[0];
    }

    getActiveVisibleTowerFloor(engine) {
        const visibleRows = Math.max(
            1,
            Math.floor(Number(GameConfig.towerVisibleRowCapacity) || 1)
        );
        const startRatio = Math.max(
            0,
            Math.min(1, Number(GameConfig.towerScrollStartRatio) || 0)
        );
        const startRows = Math.max(1, Math.floor(visibleRows * startRatio));
        const clearanceRows = Math.max(
            0,
            Math.floor(Number(GameConfig.towerTopIndicatorClearanceRows) || 0)
        );
        const flushRows = Math.max(startRows, visibleRows - clearanceRows);
        const targetHeight = Math.max(0, Number(engine.room?.targetHeight) || 0);

        if (targetHeight > 0 && targetHeight <= flushRows) {
            return 0;
        }

        let focusHeight = Math.max(1, Number(engine.room?.currentHeight) || 0);
        if (targetHeight > 0) {
            focusHeight = Math.min(focusHeight, targetHeight);
        }
        if (focusHeight <= startRows) {
            return 0;
        }

        let linearProgress = 1;
        if (targetHeight > startRows) {
            linearProgress = Math.max(
                0,
                Math.min(1, (focusHeight - startRows) / (targetHeight - startRows))
            );
        }
        const easePower = Math.max(0.01, Number(GameConfig.towerScrollEasePower) || 1);
        const topRow = startRows + (flushRows - startRows) * Math.pow(linearProgress, easePower);
        return Math.max(0, Math.round(focusHeight - topRow));
    }

    getCriticalRescueContext(engine, structureBefore = null) {
        const entries = engine.room?.towerBlocks || [];
        const stabilityConfig = engine.resolveStabilityConfig();
        const result = structureBefore || engine.room?.towerStabilityResult ||
            TowerStability.evaluate(entries, stabilityConfig);
        const threshold = Number(GameConfig.towerStabilityCriticalThreshold || 0);
        const criticalSupport = result?.diagnostics?.criticalSupport;

        if (
            !criticalSupport ||
            Boolean(result?.diagnostics?.collapsed) ||
            Number(result?.stability ?? 100) > threshold
        ) {
            return null;
        }

        const groups = Array.isArray(result?.analysis?.groups)
            ? result.analysis.groups
            : [];
        const supportId = String(criticalSupport.id || "");
        const componentId = criticalSupport.componentId;
        const criticalGroup = groups.filter(group => (
            (componentId === undefined || group.componentId === componentId) &&
            (supportId === "" || (group.memberBlockIds || []).includes(supportId)) &&
            Number(group.pivotY) === Number(criticalSupport.pivotY)
        )).sort((left, right) => {
            if (right.risk !== left.risk) {
                return right.risk - left.risk;
            }

            if (right.carriedLoadShare !== left.carriedLoadShare) {
                return right.carriedLoadShare - left.carriedLoadShare;
            }

            return String(left.key).localeCompare(String(right.key));
        })[0];

        if (!criticalGroup?.signature) {
            return null;
        }

        const memberIds = new Set(criticalGroup.memberBlockIds || []);
        const supportCells = new Set(entries.filter(entry => (
            memberIds.has(String(entry?.block?.id ?? entry?.blockId ?? ""))
        )).flatMap(entry => TowerStability.cellsFor(entry)).map(cell => (
            `${cell.x},${cell.y}`
        )));

        return {
            signature: criticalGroup.signature,
            supportCells,
            pivotX: Number(criticalSupport.pivotX) || 0,
            pivotY: Number(criticalSupport.pivotY) || 0,
            supportWidth: Math.max(1, Number(criticalSupport.effectiveSupportWidth) || 1)
        };
    }

    isCriticalSupportTarget(block, originX, originY, criticalContext) {
        if (!criticalContext) {
            return false;
        }

        const placedCells = TowerStability.cellsFor({ block, originX, originY });
        const directlySupportsCriticalRegion = placedCells.some(cell => (
            criticalContext.supportCells.has(`${cell.x},${cell.y + 1}`)
        ));

        if (directlySupportsCriticalRegion) {
            return true;
        }

        const horizontalReach = Math.ceil(criticalContext.supportWidth / 2) + 1;

        return placedCells.some(cell => (
            cell.y >= Math.floor(criticalContext.pivotY) - 1 &&
            cell.y <= Math.ceil(criticalContext.pivotY) &&
            Math.abs((cell.x + 0.5) - criticalContext.pivotX) <= horizontalReach
        ));
    }

    isVisibleStructuralRepair(engine, candidate, criticalContext = null) {
        return candidate.heightGain !== 0 ||
            candidate.originY >= this.getActiveVisibleTowerFloor(engine) ||
            Boolean(candidate.criticalSupportTarget && criticalContext);
    }

    previewCollapseConsequence(entries, stabilityConfig, initialResult = null) {
        const projected = entries.map(entry => ({ ...entry }));
        let result = initialResult || TowerStability.evaluate(projected, stabilityConfig);
        const fallenEntryIndexes = new Set();
        const fallenBlockIds = new Set();
        let collapsedComponentCount = 0;
        let collapseIterations = 0;
        const predictedCollapse = Boolean(
            result?.diagnostics?.collapsed || Number(result?.stability) <= 0
        );

        for (
            let iteration = 0;
            iteration < projected.length && result?.diagnostics?.collapsed;
            iteration += 1
        ) {
            const collapsedComponents = (result.components || []).filter(component => (
                component.diagnostics?.collapsed
            ));
            let applied = false;

            for (const component of collapsedComponents) {
                const entryIndexes = component.collapseEntryIndexes || component.entryIndexes || [];

                for (const entryIndex of entryIndexes) {
                    const entry = projected[entryIndex];

                    if (!entry || entry.towerState === "fallen") {
                        continue;
                    }

                    entry.towerState = "fallen";
                    fallenEntryIndexes.add(entryIndex);
                    const blockId = String(entry.block?.id ?? entry.blockId ?? "");
                    if (blockId) {
                        fallenBlockIds.add(blockId);
                    }
                    applied = true;
                }
            }

            if (!applied) {
                break;
            }

            collapsedComponentCount += collapsedComponents.length;
            collapseIterations += 1;
            result = TowerStability.evaluate(projected, stabilityConfig);
        }

        return {
            collapseSummary: {
                anyFallen: predictedCollapse,
                entryIndexes: [...fallenEntryIndexes].sort((left, right) => left - right),
                blockIds: [...fallenBlockIds].sort()
            },
            fallenEntryCount: fallenEntryIndexes.size,
            collapsedComponentCount,
            collapseIterations,
            remainingHeight: TowerStability.topHeight(projected)
        };
    }

    chooseBotPlacement(engine, block, strategy = GameConfig.debugBotStrategy, options = {}) {
        if (!block) {
            return null;
        }

        const entries = engine.room.towerBlocks || [];
        const { min, max } = engine.getPlaceableOriginRange(block);
        const previousHeight = TowerStability.topHeight(entries);
        const targetHeight = engine.room.targetHeight;
        const currentHeight = engine.room.currentHeight;
        const perHeight = Number(GameConfig.scoring.placementScorePerHeight) || 0;
        const stabilityConfig = engine.resolveStabilityConfig();
        const structureBefore = engine.room.towerStabilityResult || TowerStability.evaluate(
            entries, stabilityConfig
        );
        const criticalContext = options.criticalContext === undefined
            ? this.getCriticalRescueContext(engine, structureBefore)
            : options.criticalContext;
        const releaseRows = this.getVoidReleaseRows(entries, min, max);

        if (criticalContext) {
            const supportRows = [
                Math.max(0, Math.floor(criticalContext.pivotY) - 1),
                Math.max(0, Math.floor(criticalContext.pivotY))
            ];

            releaseRows.push(...supportRows.filter(row => !releaseRows.includes(row)));
        }

        const seen = new Set();
        const cheapCandidates = [];
        const rescueCandidates = [];

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
                const criticalSupportTarget = this.isCriticalSupportTarget(
                    block, placement.originX, placement.originY, criticalContext
                );
                if (!this.isVisibleStructuralRepair(engine, {
                    heightGain,
                    originY: placement.originY,
                    criticalSupportTarget
                }, criticalContext)) {
                    continue;
                }
                const candidate = {
                    column: column,
                    originX: placement.originX,
                    originY: placement.originY,
                    heightGain: heightGain,
                    effectiveHeight: effectiveHeight,
                    proxy: effectiveHeight * perHeight + supportedCells,
                    supportedCells,
                    criticalSupportTarget,
                    projected: projected
                };

                if (criticalSupportTarget) {
                    rescueCandidates.push(candidate);
                }

                cheapCandidates.push(candidate);
            }
        }

        if (cheapCandidates.length === 0) {
            return null;
        }

        const ordinarySurvivors = cheapCandidates
            .sort((a, b) => b.proxy - a.proxy)
            .slice(0, STANDARD_SHORTLIST_SIZE);
        const rescueSurvivors = rescueCandidates
            .sort((left, right) => {
                if (right.supportedCells !== left.supportedCells) {
                    return right.supportedCells - left.supportedCells;
                }

                const leftDistance = Math.abs(left.originY - criticalContext.pivotY);
                const rightDistance = Math.abs(right.originY - criticalContext.pivotY);

                if (leftDistance !== rightDistance) {
                    return leftDistance - rightDistance;
                }

                return right.proxy - left.proxy;
            })
            .slice(0, CRITICAL_RESCUE_SHORTLIST_SIZE);
        const survivorKeys = new Set();
        const survivors = [...ordinarySurvivors, ...rescueSurvivors].filter(candidate => {
            const key = `${candidate.originX},${candidate.originY}`;

            if (survivorKeys.has(key)) {
                return false;
            }

            survivorKeys.add(key);
            return true;
        });

        const scored = [];

        for (const candidate of survivors) {
            const result = TowerStability.evaluate(candidate.projected, stabilityConfig);
            const predictedCollapse = Boolean(
                result.diagnostics?.collapsed || Number(result.stability) <= 0
            );
            const collapseConsequence = predictedCollapse
                ? this.previewCollapseConsequence(candidate.projected, stabilityConfig, result)
                : null;

            const placedEntry = candidate.projected[candidate.projected.length - 1];
            const transaction = engine.previewPlacementScore({
                block,
                effectiveHeight: candidate.effectiveHeight,
                placedEntry,
                beforeResult: structureBefore,
                afterResult: result,
                stabilityConfig,
                collapseSummary: collapseConsequence?.collapseSummary
            });
            const assessment = transaction.assessment || {};
            const criticalRescue = Boolean(
                criticalContext &&
                candidate.criticalSupportTarget &&
                !transaction.collapse &&
                assessment.criticalSaveCandidate &&
                assessment.criticalInterfaceBefore?.signature === criticalContext.signature
            );

            scored.push({
                column: candidate.column,
                originX: candidate.originX,
                originY: candidate.originY,
                heightGain: candidate.heightGain,
                stability: result.stability,
                points: transaction.points,
                structuralPoints: transaction.structuralPoints,
                criticalSavePoints: transaction.criticalSavePoints,
                heightPoints: transaction.heightPoints,
                criticalSave: Boolean(transaction.criticalSave),
                criticalRescue,
                riskIncrease: Number(assessment.riskIncrease || 0),
                collapseConsequence,
                collapsed: Boolean(transaction.collapse || predictedCollapse)
            });
        }

        if (this.isLegacyStrategy(strategy)) {
            const safe = scored.filter(candidate => !candidate.collapsed);

            if (safe.length === 0 && options.allowCollapsedFallback) {
                return this.rankCriticalLastResort(scored);
            }

            return this.rankByStrategy(
                safe,
                strategy
            );
        }

        const safe = scored.filter(candidate => !candidate.collapsed);

        if (criticalContext && safe.length === 0) {
            return this.rankCriticalLastResort(scored);
        }

        return this.rankByProfile(
            criticalContext ? safe : scored,
            this.normalizeBotProfile(strategy, "engineer")
        );
    }

    buildDecision(profile, intent, engine, candidate = null) {
        const stability = candidate?.stability ?? engine.room?.towerStability ?? 100;

        return {
            personality: profile.personality,
            intent: intent,
            expectedPoints: Math.max(0, Math.round(Number(candidate?.points || 0))),
            heightGain: Math.max(0, Math.round(Number(candidate?.heightGain || 0))),
            stability: Math.max(0, Math.round(Number(stability) || 0)),
            risky: Boolean(candidate?.collapsed || candidate?.risky ||
                Number(candidate?.riskIncrease || 0) > 0),
            bad: Boolean(candidate?.collapsed || candidate?.bad ||
                (candidate && Number(candidate.points || 0) <= 0))
        };
    }

    buildPlacementAction(profile, engine, candidate) {
        const intent = candidate.criticalSave
            ? "critical_save"
            : candidate.heightGain > 0
                ? "height"
                : "reinforce";

        return {
            type: "place",
            blockIndex: candidate.blockIndex,
            column: candidate.column,
            originY: candidate.originY,
            decision: this.buildDecision(profile, intent, engine, candidate)
        };
    }

    choosePowerSlot(bot, engine, profile) {
        if (engine.room?.state !== "playing" || !Array.isArray(bot.powerInventory)) {
            return -1;
        }

        const remainingMs = typeof engine.getRemainingMs === "function"
            ? engine.getRemainingMs()
            : Infinity;
        const critical = Number(engine.room.towerStability || 100) <=
            Number(GameConfig.towerStabilityCriticalThreshold || 0);
        const chance = profile.powerUse * (critical ? 0.48 : 0.08);

        if (remainingMs <= 3000 || Math.random() >= chance) {
            return -1;
        }

        return bot.powerInventory.findIndex(item => item);
    }

    shouldRiskCollapse(candidate, profile) {
        if (!candidate?.collapsed) {
            return true;
        }

        const errorChance = (0.005 + profile.riskTolerance * 0.025) *
            (1 - profile.skill * 0.5);

        return Math.random() < errorChance;
    }

    getCriticalTowerFingerprint(engine, criticalContext) {
        const entries = engine.room?.towerBlocks || [];
        const tower = entries.map(entry => {
            return [
                String(entry?.block?.id ?? entry?.blockId ?? ""),
                Number(entry?.originX) || 0,
                Number(entry?.originY ?? entry?.baseHeight) || 0,
                String(entry?.towerState || "standing")
            ].join(":");
        }).join("|");

        return [
            Number(engine.room?.level) || 0,
            criticalContext.signature,
            Number(engine.room?.towerStability ?? 100),
            tower
        ].join("/");
    }

    resetCriticalRescueWaitState(bot) {
        if (bot) {
            bot.criticalRescueWaitState = null;
        }
    }

    getCriticalLastResortWaitLimit(profile) {
        const base = CRITICAL_LAST_RESORT_WAITS[profile.personality] ??
            CRITICAL_LAST_RESORT_WAITS.engineer;
        const caution = Math.round((1 - profile.riskTolerance) * 2);

        return base + caution;
    }

    shouldTakeCriticalLastResort(bot, engine, profile, criticalContext) {
        const fingerprint = this.getCriticalTowerFingerprint(engine, criticalContext);
        let state = bot?.criticalRescueWaitState;

        if (!state || state.fingerprint !== fingerprint) {
            state = { fingerprint, waits: 0 };
            if (bot) {
                bot.criticalRescueWaitState = state;
            }
        }

        if (state.waits >= this.getCriticalLastResortWaitLimit(profile)) {
            this.resetCriticalRescueWaitState(bot);
            return true;
        }

        state.waits += 1;
        return false;
    }

    rankCriticalLastResort(candidates) {
        return candidates.slice().sort((left, right) => {
            const leftConsequence = left.collapseConsequence || {};
            const rightConsequence = right.collapseConsequence || {};
            const leftFallen = Number(leftConsequence.fallenEntryCount) || 0;
            const rightFallen = Number(rightConsequence.fallenEntryCount) || 0;

            if (leftFallen !== rightFallen) {
                return leftFallen - rightFallen;
            }

            const leftRemainingHeight = Number(leftConsequence.remainingHeight) || 0;
            const rightRemainingHeight = Number(rightConsequence.remainingHeight) || 0;

            if (rightRemainingHeight !== leftRemainingHeight) {
                return rightRemainingHeight - leftRemainingHeight;
            }

            const leftComponents = Number(leftConsequence.collapsedComponentCount) || 0;
            const rightComponents = Number(rightConsequence.collapsedComponentCount) || 0;

            if (leftComponents !== rightComponents) {
                return leftComponents - rightComponents;
            }

            const leftIterations = Number(leftConsequence.collapseIterations) || 0;
            const rightIterations = Number(rightConsequence.collapseIterations) || 0;

            if (leftIterations !== rightIterations) {
                return leftIterations - rightIterations;
            }

            if (right.stability !== left.stability) {
                return right.stability - left.stability;
            }

            if (left.riskIncrease !== right.riskIncrease) {
                return left.riskIncrease - right.riskIncrease;
            }

            if (right.heightGain !== left.heightGain) {
                return right.heightGain - left.heightGain;
            }

            if (left.originY !== right.originY) {
                return left.originY - right.originY;
            }

            return left.column - right.column;
        })[0] || null;
    }

    chooseBotAction(bot, engine, strategy = GameConfig.debugBotStrategy) {
        const profile = this.getBotProfile(bot, strategy);
        const selectionStrategy = bot?.botProfile
            ? profile
            : strategy;
        const remainingHeight = Math.max(
            0, engine.room.targetHeight - engine.room.currentHeight
        );
        const blocks = bot.blocks || [];
        const criticalContext = this.getCriticalRescueContext(engine);

        if (!criticalContext) {
            this.resetCriticalRescueWaitState(bot);
        }

        const powerSlot = this.choosePowerSlot(bot, engine, profile);

        if (powerSlot >= 0) {
            return {
                type: "power",
                slot: powerSlot,
                decision: this.buildDecision(profile, "power", engine)
            };
        }

        const exactIndex = blocks.findIndex(block => {
            return engine.getBlockHeight(block) === remainingHeight;
        });

        if (!criticalContext && exactIndex >= 0) {
            const placement = this.chooseBotPlacement(
                engine, blocks[exactIndex], selectionStrategy
            );

            if (placement) {
                if (!this.isLegacyStrategy(selectionStrategy) &&
                    !this.shouldRiskCollapse(placement, profile)) {
                    return {
                        type: "wait",
                        decision: this.buildDecision(profile, "wait", engine)
                    };
                }

                return this.buildPlacementAction(profile, engine, {
                    ...placement,
                    blockIndex: exactIndex
                });
            }
        }

        const pairs = [];
        const placementOptions = {
            criticalContext,
            allowCollapsedFallback: Boolean(criticalContext)
        };

        blocks.forEach((block, index) => {
            const placement = this.chooseBotPlacement(
                engine, block, selectionStrategy, placementOptions
            );

            if (placement) {
                pairs.push({ ...placement, blockIndex: index });
            }
        });

        if (criticalContext) {
            const safePairs = pairs.filter(pair => !pair.collapsed);
            const safeRescues = safePairs.filter(pair => pair.criticalRescue);

            if (safePairs.length > 0) {
                this.resetCriticalRescueWaitState(bot);
            } else {
                const lastResort = this.rankCriticalLastResort(
                    pairs.filter(pair => pair.collapsed)
                );

                if (lastResort) {
                    if (!this.shouldTakeCriticalLastResort(
                        bot, engine, profile, criticalContext
                    )) {
                        return {
                            type: "wait",
                            decision: this.buildDecision(profile, "wait", engine)
                        };
                    }

                    return this.buildPlacementAction(profile, engine, lastResort);
                }
            }

            if (profile.personality === "engineer" && safeRescues.length > 0) {
                const rescue = this.rankByProfile(safeRescues, profile);

                return this.buildPlacementAction(profile, engine, rescue);
            }
        }

        if (
            (!this.isLegacyStrategy(selectionStrategy) || selectionStrategy !== "mvp_greedy") &&
            remainingHeight > 0 &&
            this.hasClearedShareWhileTeammateShort(bot, engine) &&
            (this.isLegacyStrategy(selectionStrategy) ||
                Math.random() < this.getCooperationChance(profile))
        ) {
            const repairs = pairs.filter(pair => {
                return pair.heightGain === 0 && pair.points > 0;
            });
            const bestRepair = this.isLegacyStrategy(selectionStrategy)
                ? this.rankByStrategy(repairs, selectionStrategy)
                : this.rankByProfile(repairs, profile);

            if (bestRepair) {
                return this.buildPlacementAction(profile, engine, bestRepair);
            }

            return {
                type: "wait",
                decision: this.buildDecision(profile, "wait", engine)
            };
        }

        const best = this.isLegacyStrategy(selectionStrategy)
            ? this.rankByStrategy(pairs, selectionStrategy)
            : this.rankByProfile(pairs, profile);

        if (!best) {
            return {
                type: "wait",
                decision: this.buildDecision(profile, "wait", engine)
            };
        }

        if (!this.isLegacyStrategy(selectionStrategy) &&
            !this.shouldRiskCollapse(best, profile)) {
            return {
                type: "wait",
                decision: this.buildDecision(profile, "wait", engine)
            };
        }

        return this.buildPlacementAction(profile, engine, best);
    }

    getCooperationChance(profile) {
        if (profile.personality === "engineer") {
            return Math.min(1, 0.25 + profile.repairAwareness * 0.75);
        }

        if (profile.personality === "climber") {
            return Math.min(1, 0.08 + profile.repairAwareness * 0.20);
        }

        return Math.min(
            1,
            0.05 + (1 - profile.greed) * 0.25 + profile.repairAwareness * 0.10
        );
    }

}

module.exports =
    new BotManager();
