"use strict";

function cellsFor(entry) {
    const block = entry.block || {};
    const cells = Array.isArray(block.cells) ? block.cells : [];
    return cells.map(cell => ({
        x: Number(cell[0] ?? cell.x ?? 0) + Number(entry.originX ?? 0),
        y: Number(cell[1] ?? cell.y ?? 0) + Number(entry.originY ?? entry.baseHeight ?? 0)
    }));
}

function key(x, y) { return `${x},${y}`; }

function clamp01(value) { return Math.max(0, Math.min(1, value)); }

function topHeight(entries) {
    return cellsForEntries(entries).reduce((top, cell) => Math.max(top, cell.y + 1), 0);
}

function cellsForEntries(entries) { return entries.flatMap(cellsFor); }

function settleBlock(entries, block, originX) {
    const cells = (block.cells || []).map(cell => ({ x: Number(cell[0]), y: Number(cell[1]) }));
    const anchoredX = Math.round(Number(originX) || 0);
    const occupied = new Set(cellsForEntries(entries).map(cell => key(cell.x, cell.y)));
    let originY = topHeight(entries) + 8;
    const collides = y => cells.some(cell => occupied.has(key(cell.x + anchoredX, cell.y + y)));
    while (originY > 0 && !collides(originY - 1)) originY -= 1;
    return { originX: anchoredX, originY };
}

function evaluate(entries, config) {
    if (!entries || entries.length === 0) {
        return {
            stability: 100,
            diagnostics: {
                comOffset: 0,
                laneImbalance: 0,
                overhangPenalty: 0,
                tiltScore: 0,
                tiltAngleDeg: 0,
                leanDirection: "center",
                integrity: 100,
                slenderness: 0,
                supportRatio: 1,
                collapsed: false
            }
        };
    }

    const occupied = new Map();
    const columnTop = new Map();
    let cellCount = 0;
    let comSum = 0;
    let groundMinX = Infinity;
    let groundMaxX = -Infinity;

    for (const entry of entries) {
        for (const cell of cellsFor(entry)) {
            occupied.set(key(cell.x, cell.y), true);
            comSum += cell.x;
            cellCount += 1;
            if ((cell.y + 1) > (columnTop.get(cell.x) || 0)) {
                columnTop.set(cell.x, cell.y + 1);
            }
            if (cell.y === 0) {
                groundMinX = Math.min(groundMinX, cell.x);
                groundMaxX = Math.max(groundMaxX, cell.x);
            }
        }
    }

    if (!Number.isFinite(groundMinX)) {
        groundMinX = 0;
        groundMaxX = 0;
    }

    const baseCenter = (groundMinX + groundMaxX) / 2;
    const baseHalfWidth = Math.max(
        (groundMaxX - groundMinX) / 2,
        config.towerBaseHalfWidthFloor ?? 1.0
    );
    const comX = comSum / cellCount;
    const comOffset = (comX - baseCenter) / baseHalfWidth;

    let heightWeightedSum = 0;
    let totalColumnHeight = 0;
    for (const [x, top] of columnTop) {
        heightWeightedSum += x * top;
        totalColumnHeight += top;
    }
    const laneCentroid =
        totalColumnHeight > 0 ? heightWeightedSum / totalColumnHeight : baseCenter;
    const laneImbalanceWeight = config.towerLaneImbalanceWeight ?? 0.15;
    const laneImbalance =
        ((laneCentroid - baseCenter) / baseHalfWidth) * laneImbalanceWeight;

    const lastEntry = entries[entries.length - 1];
    const overhangWeight = config.towerOverhangWeight ?? 0.18;
    let overhangPenalty = 0;

    for (const cell of cellsFor(lastEntry)) {
        const supported = cell.y === 0 || occupied.has(key(cell.x, cell.y - 1));
        if (!supported) {
            overhangPenalty += (Math.abs(cell.x - baseCenter) / baseHalfWidth) * overhangWeight;
        }
    }

    const height = topHeight(entries);

    // A stubby tower physically cannot topple, and with only a handful of cells
    // placed every ratio below swings wildly -- a lone T resting on its stem
    // reads as 50% unsupported. Every penalty term is therefore scaled in as the
    // tower grows, so the opening bricks are always safe.
    const stabilityMinHeight = Math.max(1, config.towerStabilityMinHeight ?? 6);
    const maturity = Math.min(1, height / stabilityMinHeight);

    const rawScore = (comOffset + laneImbalance + overhangPenalty) * maturity;
    const collapseThreshold = config.towerCollapseTiltScore ?? 1.0;
    const clampCeiling = collapseThreshold * 1.6;
    const tiltScore = Math.max(-clampCeiling, Math.min(clampCeiling, rawScore));

    const maxTiltDeg = config.towerMaxTiltAngleDeg ?? 24;
    const tiltAngleDeg = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, tiltScore * maxTiltDeg));

    const groundWidth = Math.max(1, groundMaxX - groundMinX + 1);
    const siteWidth = Math.max(1, Number(config.towerSiteWidth) || groundWidth);
    const slenderness = siteWidth / groundWidth;
    const slendernessSafe = config.towerSlendernessSafe ?? 2.5;
    const slendernessMax = config.towerSlendernessMax ?? 6.0;
    const slendernessSpan = Math.max(0.0001, slendernessMax - slendernessSafe);
    const slendernessPenalty =
        clamp01((slenderness - slendernessSafe) / slendernessSpan) * maturity;

    let unsupportedCells = 0;
    for (const entry of entries) {
        for (const cell of cellsFor(entry)) {
            if (cell.y !== 0 && !occupied.has(key(cell.x, cell.y - 1))) {
                unsupportedCells += 1;
            }
        }
    }
    const supportDeficit = cellCount > 0 ? unsupportedCells / cellCount : 0;
    const supportDeficitMax = Math.max(0.0001, config.towerSupportDeficitMax ?? 0.35);
    const supportPenalty = clamp01(supportDeficit / supportDeficitMax) * maturity;

    const integrity = Math.round(
        (1 - clamp01(slendernessPenalty + supportPenalty)) * 100
    );

    const leanStability = Math.round(
        (1 - Math.min(1, Math.abs(tiltScore) / collapseThreshold)) * 100
    );
    const collapsed = Math.abs(tiltScore) >= collapseThreshold || integrity <= 0;
    const stability = collapsed ? 0 : Math.min(leanStability, integrity);

    let leanDirection = "center";
    if (tiltScore > 0.05) leanDirection = "right";
    else if (tiltScore < -0.05) leanDirection = "left";

    return {
        stability,
        diagnostics: {
            comOffset,
            laneImbalance,
            overhangPenalty,
            tiltScore,
            tiltAngleDeg,
            leanDirection,
            integrity,
            slenderness,
            supportRatio: 1 - supportDeficit,
            collapsed
        }
    };
}

function structuralLean(diagnostics) {
    const d = diagnostics || {};
    return (Number(d.comOffset) || 0) + (Number(d.laneImbalance) || 0);
}

// How far one placement moved the tower back toward centre, in points of the
// collapse budget. Positive = straighter, negative = more lopsided.
//
// Deliberately NOT the change in `stability`: that score is min(lean, integrity)
// and decays with height on its own, so a flawlessly centred brick still reads
// as a loss, and a lean correction is masked whenever integrity is the lower
// axis. This reads only the persistent structural lean, which comes out of
// evaluate() before the maturity ramp is applied -- that is what keeps it free
// of the height drift.
//
// overhangPenalty is deliberately excluded even though it is already isolated to
// the placed brick: a dangling brick puts its mass off-centre, so comOffset
// already charges for it, and subtracting it again both double-counts and adds a
// one-sided negative bias (over half of all placements carry some overhang, so
// it made ordinary placements frown).
function balanceDelta(before, after, config) {
    const collapse = Math.max(
        0.0001, Number((config || {}).towerCollapseTiltScore) || 1
    );
    const leanBefore = Math.abs(structuralLean(before));
    const leanAfter = Math.abs(structuralLean(after));
    const points = ((leanBefore - leanAfter) / collapse) * 100;

    return Math.max(-100, Math.min(100, Math.round(points)));
}

module.exports = {
    cellsFor, topHeight, settleBlock, evaluate, structuralLean, balanceDelta
};
