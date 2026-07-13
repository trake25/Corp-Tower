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

function topHeight(entries) {
    return cellsForEntries(entries).reduce((top, cell) => Math.max(top, cell.y + 1), 0);
}

function cellsForEntries(entries) { return entries.flatMap(cellsFor); }

function settleBlock(entries, block, width) {
    const cells = (block.cells || []).map(cell => ({ x: Number(cell[0]), y: Number(cell[1]) }));
    const minX = Math.min(...cells.map(cell => cell.x));
    const maxX = Math.max(...cells.map(cell => cell.x));
    const originX = Math.floor((width - (maxX - minX + 1)) / 2) - minX;
    const occupied = new Set(cellsForEntries(entries).map(cell => key(cell.x, cell.y)));
    let originY = topHeight(entries) + 8;
    const collides = y => cells.some(cell => occupied.has(key(cell.x + originX, cell.y + y)));
    while (originY > 0 && !collides(originY - 1)) originY -= 1;
    return { originX, originY };
}

// ---------------------------------------------------------------------------
// Stability model
//
// Deterministic and grid-only: a pure function of the current block
// positions in `entries` - no history, no randomness, no hidden state.
// Re-running evaluate() on the same array always produces the same result,
// which the balance simulator depends on (thousands of runs must be
// reproducible) and which lets the client re-derive the same tilt from a
// state snapshot after reconnecting, rather than needing a replayed history.
//
// Two components:
//
// 1. comOffset - whole-tower lean. Is the tower's overall center of mass
//    still over its footprint on the ground? This is the same criterion
//    that determines whether a physical stack of boxes tips: only the
//    horizontal position of the center of mass matters, not the height of
//    the stack.
//
// 2. overhangPenalty - reaction to the block that was JUST placed. A block
//    landing with part of it hanging over empty space should read as a bad
//    placement immediately, even if it barely moves the tower's overall
//    center of mass (one small block is a rounding error against a tall
//    tower). This only looks at the most recently placed entry, so it
//    reacts to the placement that caused it rather than re-penalizing old,
//    already-settled overhangs on every subsequent turn.
// ---------------------------------------------------------------------------

function evaluate(entries, config) {
    if (!entries || entries.length === 0) {
        return {
            stability: 100,
            diagnostics: {
                comOffset: 0,
                overhangPenalty: 0,
                tiltScore: 0,
                tiltAngleDeg: 0,
                leanDirection: "center",
                collapsed: false
            }
        };
    }

    const occupied = new Map();
    let cellCount = 0;
    let comSum = 0;
    let groundMinX = Infinity;
    let groundMaxX = -Infinity;

    for (const entry of entries) {
        for (const cell of cellsFor(entry)) {
            occupied.set(key(cell.x, cell.y), true);
            comSum += cell.x;
            cellCount += 1;
            if (cell.y === 0) {
                groundMinX = Math.min(groundMinX, cell.x);
                groundMaxX = Math.max(groundMaxX, cell.x);
            }
        }
    }

    // Guard against dividing by an empty base - shouldn't happen in normal
    // play since the first block always settles onto the floor.
    if (!Number.isFinite(groundMinX)) {
        groundMinX = 0;
        groundMaxX = 0;
    }

    const baseCenter = (groundMinX + groundMaxX) / 2;
    const baseHalfWidth = Math.max((groundMaxX - groundMinX) / 2, 0.5);
    const comX = comSum / cellCount;
    const comOffset = (comX - baseCenter) / baseHalfWidth;

    // Overhang penalty from the block that was just placed (last entry).
    const lastEntry = entries[entries.length - 1];
    const overhangWeight = config.towerOverhangWeight ?? 0.18;
    let overhangPenalty = 0;

    for (const cell of cellsFor(lastEntry)) {
        const supported = cell.y === 0 || occupied.has(key(cell.x, cell.y - 1));
        if (!supported) {
            overhangPenalty += (Math.abs(cell.x - baseCenter) / baseHalfWidth) * overhangWeight;
        }
    }

    const rawScore = comOffset + overhangPenalty;
    const collapseThreshold = config.towerCollapseTiltScore ?? 1.0;
    const clampCeiling = collapseThreshold * 1.6;
    const tiltScore = Math.max(-clampCeiling, Math.min(clampCeiling, rawScore));

    const maxTiltDeg = config.towerMaxTiltAngleDeg ?? 24;
    const tiltAngleDeg = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, tiltScore * maxTiltDeg));

    const collapsed = Math.abs(tiltScore) >= collapseThreshold;
    const stability = collapsed
        ? 0
        : Math.round((1 - Math.min(1, Math.abs(tiltScore) / collapseThreshold)) * 100);

    let leanDirection = "center";
    if (tiltScore > 0.05) leanDirection = "right";
    else if (tiltScore < -0.05) leanDirection = "left";

    return {
        stability,
        diagnostics: { comOffset, overhangPenalty, tiltScore, tiltAngleDeg, leanDirection, collapsed }
    };
}

module.exports = { cellsFor, topHeight, settleBlock, evaluate };
