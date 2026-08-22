function cloneCells(cells) {
    return cells.map(cell => [Number(cell[0]), Number(cell[1])]);
}

function getBlockHeight(block) {
    if (typeof block === "number") {
        return block;
    }

    if (!block || typeof block !== "object") {
        return 0;
    }

    if (Number.isFinite(Number(block.height))) {
        return Number(block.height);
    }

    if (!Array.isArray(block.cells) || block.cells.length === 0) {
        return 0;
    }

    const rows = block.cells.map(cell => Number(cell[1]));
    return Math.max(...rows) - Math.min(...rows) + 1;
}

function getBlockCellCount(block) {
    if (typeof block === "number") {
        return block;
    }

    if (Array.isArray(block?.cells)) {
        return block.cells.length;
    }

    return getBlockHeight(block);
}

function normalizeCells(cells) {
    const minX = Math.min(...cells.map(cell => Number(cell[0])));
    const minY = Math.min(...cells.map(cell => Number(cell[1])));
    return cells.map(cell => [Number(cell[0]) - minX, Number(cell[1]) - minY]);
}

function rotateCellsCW(cells) {
    return normalizeCells(cells.map(cell => [Number(cell[1]), -Number(cell[0])]));
}

function reflectCellsX(cells) {
    return normalizeCells(cells.map(cell => [-Number(cell[0]), Number(cell[1])]));
}

function getRotations(cells) {
    const rotations = [];
    const seen = new Set();
    let current = normalizeCells(cells);

    for (let i = 0; i < 4; i++) {
        const rotationKey = current
            .map(cell => cell.join(","))
            .sort()
            .join("|");

        if (!seen.has(rotationKey)) {
            seen.add(rotationKey);
            rotations.push(current);
        }

        current = rotateCellsCW(current);
    }

    return rotations;
}

function getOrientations(cells) {
    const orientations = [];
    const seen = new Set();

    [cells, reflectCellsX(cells)].forEach(startCells => {
        let current = normalizeCells(startCells);

        for (let i = 0; i < 4; i++) {
            const orientationKey = current
                .map(cell => cell.join(","))
                .sort()
                .join("|");

            if (!seen.has(orientationKey)) {
                seen.add(orientationKey);
                orientations.push(current);
            }

            current = rotateCellsCW(current);
        }
    });

    return orientations;
}

module.exports = {
    cloneCells,
    getBlockHeight,
    getBlockCellCount,
    normalizeCells,
    rotateCellsCW,
    reflectCellsX,
    getRotations,
    getOrientations
};
