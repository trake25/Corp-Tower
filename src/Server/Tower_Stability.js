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

function evaluate(entries, config) {
    const occupied = new Map();
    const loads = new Map();
    let unsupportedLoad = 0;
    let eccentricLoad = 0;
    let overload = 0;
    for (const entry of entries) {
        const cells = cellsFor(entry);
        const own = Math.max(1, cells.length);
        const bottom = cells.filter(cell => !cells.some(other => other.x === cell.x && other.y === cell.y - 1));
        const supports = bottom.filter(cell => cell.y === 0 || occupied.has(key(cell.x, cell.y - 1)));
        const carried = own + cells.reduce((sum, cell) => sum + (loads.get(key(cell.x, cell.y)) || 0), 0);
        const ratio = supports.length / Math.max(1, bottom.length);
        unsupportedLoad += carried * (1 - ratio);
        if (supports.length > 0) {
            const center = cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length;
            const supportCenter = supports.reduce((sum, cell) => sum + cell.x, 0) / supports.length;
            eccentricLoad += Math.abs(center - supportCenter) * carried;
            const share = carried / supports.length;
            supports.forEach(cell => {
                if (cell.y > 0) {
                    const supportKey = key(cell.x, cell.y - 1);
                    const next = (loads.get(supportKey) || 0) + share;
                    loads.set(supportKey, next);
                    overload += Math.max(0, next - config.towerCellLoadCapacity) - Math.max(0, (next - share) - config.towerCellLoadCapacity);
                }
            });
        }
        cells.forEach(cell => occupied.set(key(cell.x, cell.y), entry));
    }
    const penalty = unsupportedLoad * config.towerUnsupportedLoadPenalty + eccentricLoad * config.towerEccentricLoadPenalty + overload * config.towerOverloadPenalty;
    const stability = Math.max(0, Math.min(100, Math.round(100 - penalty)));
    return { stability, diagnostics: { unsupportedLoad, eccentricLoad, overload, penalty } };
}

module.exports = { cellsFor, topHeight, settleBlock, evaluate };
