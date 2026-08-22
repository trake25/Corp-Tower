const test = require("node:test");
const assert = require("node:assert/strict");
const BlockGeometry = require("../app/engine/Block_Geometry");

test("block geometry clones numeric cells without sharing cell arrays", () => {
    const source = [["2", "3"], [3, 3]];
    const clone = BlockGeometry.cloneCells(source);

    assert.deepEqual(clone, [[2, 3], [3, 3]]);
    assert.notStrictEqual(clone[0], source[0]);
});

test("block geometry derives height and occupied cell count", () => {
    const block = { cells: [[0, 2], [1, 2], [1, 3], [1, 4]] };

    assert.equal(BlockGeometry.getBlockHeight(block), 3);
    assert.equal(BlockGeometry.getBlockCellCount(block), 4);
    assert.equal(BlockGeometry.getBlockHeight({ height: 2, cells: block.cells }), 2);
});

test("rotations and reflected orientations are normalized and deduplicated", () => {
    const lCells = [[0, 0], [0, 1], [0, 2], [1, 2]];
    const rotations = BlockGeometry.getRotations(lCells);
    const orientations = BlockGeometry.getOrientations(lCells);

    assert.equal(rotations.length, 4);
    assert.equal(orientations.length, 8);

    for (const cells of orientations) {
        assert.equal(Math.min(...cells.map(cell => cell[0])), 0);
        assert.equal(Math.min(...cells.map(cell => cell[1])), 0);
    }
});
