const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const TowerStability = require("../app/Tower_Stability");
const {
    GameConfig,
    buildTowerWithVoid,
    createBlock,
    createFlatBlock,
    createPlayingEngine,
    eventTypes,
    fixedGridTunables,
    fixedStabilityConfig,
    latestMessage,
    messageWithScoreEvents,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

test("placement emits one placement score event", () => {
    const { engine, messages } = createPlayingEngine(1, 5, {
        tunables: {
            ...fixedGridTunables(),
            towerStabilityDifficulty: 0
        }
    });

    engine.room.players[0].blocks = [createBlock(2)];
    engine.room.players[1].blocks = [createBlock(3, "B2")];

    engine.placeBlock("P1", 0);

    const message = messageWithScoreEvents(messages);
    assert.deepEqual(eventTypes(message), ["placement"]);
    assert.equal(message.placementScorePopupDurationMs, 2500);
    assert.equal(message.finishScorePopupDurationMs, 3500);
    assert.equal(message.scorePopupDurationMs, 3500);
    assert.equal(message.scoreEvents[0].playerId, "P1");
    assert.equal(message.scoreEvents[0].points, 20);
    assert.equal(message.players[0].levelScore, 20);

});

test("a Z block placed at a lane origin settles with an unsupported overhang", () => {
    const block = { cells: [[0, 0], [1, 0], [1, 1], [2, 1]] };
    const first = { block: createBlock(1), originX: 3, originY: 0 };
    const settled = TowerStability.settleBlock([first], block, 2);
    const result = TowerStability.evaluate(
        [first, { block, ...settled }], fixedStabilityConfig({ towerStabilityMinHeight: 1 })
    );
    assert.equal(settled.originX, 2);
    assert.equal(settled.originY, 1);
    assert.ok(result.stability < 100);
});

test("resolveColumnOriginX clamps the requested column to the block's valid placeable range", () => {
    const { engine } = createPlayingEngine(1, 8, { tunables: fixedGridTunables() });
    const tBlock = { shapeId: "T", cells: [[1, 0], [0, 1], [1, 1], [2, 1]] };
    const verticalIBlock = { shapeId: "I", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] };

    // T is 3 cells wide -> valid origins are columns 4..7 on the 4-9 placeable range
    assert.equal(engine.resolveColumnOriginX(tBlock, 4), 4);
    assert.equal(engine.resolveColumnOriginX(tBlock, 7), 7);
    assert.equal(engine.resolveColumnOriginX(tBlock, 2), 4);
    assert.equal(engine.resolveColumnOriginX(tBlock, 9), 7);

    // vertical I is 1 cell wide -> valid origins span the full 4..9 range
    assert.equal(engine.resolveColumnOriginX(verticalIBlock, 4), 4);
    assert.equal(engine.resolveColumnOriginX(verticalIBlock, 9), 9);
    assert.equal(engine.resolveColumnOriginX(verticalIBlock, 12), 9);
});

test("getPlaceableOriginRange narrows as block width grows, keeping the full footprint within columns 4-9", () => {
    const { engine } = createPlayingEngine(1, 8, { tunables: fixedGridTunables() });
    const oBlock = { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
    const horizontalIBlock = { shapeId: "I", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] };

    // O is 2 wide -> rightmost valid origin is 8 (occupies columns 8,9)
    assert.deepEqual(engine.getPlaceableOriginRange(oBlock), { min: 4, max: 8 });
    // horizontal I is 4 wide -> rightmost valid origin is 6 (occupies columns 6-9)
    assert.deepEqual(engine.getPlaceableOriginRange(horizontalIBlock), { min: 4, max: 6 });
});

test("site width scales with target height, staying centered on the 14-column grid", () => {
    const fixedGrid = fixedGridTunables({ widthMin: 6, widthMax: 12 });
    const { engine } = createPlayingEngine(1, 8, { tunables: fixedGrid });

    // A short target keeps the minimum 6-wide site; taller targets widen it so a
    // tall tower gets a proportionally broader base to stand on.
    assert.equal(engine.getSiteWidthForHeight(8), 6);
    assert.deepEqual(engine.getPlaceableColumnRange(), { min: 4, max: 9 });

    assert.ok(engine.getSiteWidthForHeight(30) > engine.getSiteWidthForHeight(8));
    assert.equal(engine.getSiteWidthForHeight(1000), fixedGrid.towerSiteWidthMax);

    // every derived site stays centered, so the tower still renders mid-screen
    [4, 8, 20, 30, 60].forEach(targetHeight => {
        engine.room.targetHeight = targetHeight;
        const range = engine.getPlaceableColumnRange();

        assert.equal(
            range.min + range.max,
            fixedGrid.towerGridWidth - 1,
            `site for target ${targetHeight} is off-center`
        );
    });
});

test("placeable origin range follows the level's site, not a fixed 4-9 span", () => {
    const { engine } = createPlayingEngine(1, 8, {
        tunables: fixedGridTunables({ widthMin: 6, widthMax: 12 })
    });
    const oBlock = { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };

    const narrow = engine.getPlaceableOriginRange(oBlock);

    engine.room.targetHeight = 40;
    const wide = engine.getPlaceableOriginRange(oBlock);

    assert.ok(wide.min < narrow.min);
    assert.ok(wide.max > narrow.max);
    assert.equal(engine.resolveColumnOriginX(oBlock, wide.min - 1), wide.min);
    assert.equal(engine.resolveColumnOriginX(oBlock, wide.max + 1), wide.max);
});

test("an aimed placement lands in the gap instead of falling to the top", () => {
    const { engine } = createPlayingEngine(1, 12, { tunables: fixedGridTunables() });

    buildTowerWithVoid(engine);
    engine.placeBlock("P1", 0, 5, 0);

    const fill = engine.room.towerBlocks[engine.room.towerBlocks.length - 1];

    assert.equal(fill.originX, 5);
    assert.equal(fill.originY, 0, "the brick stays in the void it was aimed at");
    assert.equal(fill.baseHeight, 0, "the settle mirror the client draws from agrees");
});

test("an origin that is no longer legal falls back to the gravity settle", () => {
    const { engine } = createPlayingEngine(1, 12, { tunables: fixedGridTunables() });

    buildTowerWithVoid(engine);
    // Column 4 row 0 is occupied -- the race where a teammate filled the target
    // gap first. The brick must still be placed, just settled.
    engine.placeBlock("P2", 0, 4, 0);

    const placed = engine.room.towerBlocks[engine.room.towerBlocks.length - 1];

    assert.equal(placed.originX, 4);
    assert.equal(placed.originY, 2, "it lands on top of the lid rather than inside a brick");
});

test("a placement with no aimed row still settles from above", () => {
    const { engine } = createPlayingEngine(1, 12, { tunables: fixedGridTunables() });

    buildTowerWithVoid(engine);
    // What a bot sends: a column and nothing else.
    engine.placeBlock("P3", 0, 5);

    const placed = engine.room.towerBlocks[engine.room.towerBlocks.length - 1];

    assert.equal(placed.originY, 2, "gravity still stops it on the lid, above the void");
});

test("a direct gap fill emits one structural placement transaction", () => {
    const { engine, messages } = createPlayingEngine(1, 12, {
        tunables: {
            ...fixedGridTunables(),
            towerStabilityDifficulty: 60
        }
    });

    buildTowerWithVoid(engine);
    engine.placeBlock("P1", 0, 5, 0);

    const event = latestMessage(messages).scoreEvents.find(
        scoreEvent => scoreEvent.type === "placement"
    );

    assert.ok(event, "filling a void is a scored placement");
    assert.ok(event.meta.structuralPoints > 0, "the direct support repair earns structural value");
    assert.equal(
        latestMessage(messages).scoreEvents.some(scoreEvent => scoreEvent.type === "reinforce"),
        false
    );
});

test("stacking on top of the tower supports nothing and pays no repair", () => {
    const { engine } = createPlayingEngine(1, 12, { tunables: fixedGridTunables() });

    buildTowerWithVoid(engine);

    assert.equal(
        TowerStability.supportedCellsGained(
            engine.room.towerBlocks, createBlock(1, "TOP"), 5, 2
        ),
        0
    );
});

test("placement legality only judges the release row, not its support", () => {
    const tower = [
        { block: createFlatBlock(2, "A"), originX: 4, originY: 0 }
    ];
    const brick = createBlock(1, "B");

    assert.equal(TowerStability.isPlacementLegal(tower, brick, 6, 0), true);
    assert.equal(TowerStability.isPlacementLegal(tower, brick, 4, 1), true);
    assert.equal(
        TowerStability.isPlacementLegal(tower, brick, 9, 4), true,
        "releasing into open air is legal -- gravity decides where it ends up"
    );
    assert.equal(TowerStability.isPlacementLegal(tower, brick, 4, 0), false);
    assert.equal(TowerStability.isPlacementLegal(tower, brick, 4, -1), false);
});

test("a brick released with nothing under it falls", () => {
    const { engine } = createPlayingEngine(1, 12, { tunables: fixedGridTunables() });

    buildTowerWithVoid(engine);
    // Column 7 is empty ground; aiming four rows up in mid-air is legal, and the
    // brick drops out of the sky rather than hanging there.
    engine.placeBlock("P1", 0, 7, 4);

    const placed = engine.room.towerBlocks[engine.room.towerBlocks.length - 1];

    assert.equal(placed.originX, 7);
    assert.equal(placed.originY, 0, "nothing holds it up, so it lands on the platform");
});

test("a normal structural transaction stays below the combined cap", () => {
    const { engine } = createPlayingEngine(3, 40);
    const transaction = engine.previewPlacementScore({
        effectiveHeight: engine.getAverageBrickHeight(),
        beforeResult: { stability: 100, diagnostics: { collapsed: false, criticalRisk: 0 }, analysis: { height: 20, groups: [] } },
        afterResult: { stability: 100, diagnostics: { collapsed: false, criticalRisk: 0 }, analysis: { height: 20, groups: [] } },
        assessment: {
            riskIncrease: 0,
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement,
            directSupportShare: 1,
            benefitedLoadShare: 1,
            criticalRiskReduction: 0,
            criticalSaveCandidate: false,
            repairClaimKey: null
        }
    });

    assert.equal(transaction.capHit, true);
    assert.equal(transaction.points, transaction.cap);
});
