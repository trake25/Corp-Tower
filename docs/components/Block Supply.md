# Block Supply

## Purpose
Block creation, the shared draw pile, opening hands, and refresh-block
generation for one room. File: `src/Server/app/engine/Block_Supply.js`. Every
export is a plain function taking the owning [[Game Engine]] instance as its
first argument; `GameEngine` re-exposes each one as a same-named method, so
callers always go through `GameEngine`, never through this file directly.

## Responsibilities
- Create individual blocks: id, shape variant, cells, derived height; pick a
  level-weighted random block size.
- Build, shuffle, and deal the shared draw pile, sized by level via
  [[Game Config]]'s generated-pile scaling.
- Generate a solvable opening hand: retries block generation until the
  combined hand + pile can exactly reach the level's target height, has
  enough precision (height ≤ 2) blocks, and meets surplus bounds — falls back
  to the last attempt if none qualifies.
- Refill a player's hand from the pile after a placement; trim an oversized
  hand down to `maxActiveBlocks`, keeping the tallest/largest blocks.
- Generate a useful refresh set: retries reshaping the player's current
  blocks, scoring each attempt, and keeping the best if none is outright
  useful.
- Prepare team carry-over blocks (smallest, most precision-friendly, capped)
  for the next level on completion.

## Public interface
Grouped by area (signature-level):
- **Block creation** — `createBlock(blockSize, excludedShapeId)`,
  `getRandomBlock()`, `createRandomUnlockedBlock(minBlockSize)`,
  `isBlockSizeUnlocked(blockSize)`, `getWeightedUnlockedBlockSize(minBlockSize)`,
  `createBlockId()`, `cloneCells(cells)`, `getBlockHeight(block)`,
  `getBlockCellCount(block)`.
- **Draw pile** — `getNextDrawBlock()`, `buildDrawPile()`,
  `getGeneratedDrawPileBlockCount()`, `generateDrawPileBlocks(count)`,
  `drawBlockFromPile()`, `shuffleBlocks(blocks)`, `getTotalBlockHeight(blocks)`.
- **Opening hand** — `getBlocksPerPlayer()`, `dealOpeningHands()`,
  `generateSolvableOpeningHandBlocks()`,
  `isLevelBlockSupplyValid(blocks, minimumOpeningBlocks)`,
  `countPrecisionBlocks(blocks)`, `hasExactHeightCombination(blocks, targetHeight)`,
  `refillPlayerBlock(player)`, `trimInventory(blocks)`.
- **Refresh** — `generateRefreshBlocks(currentBlocks)`,
  `createRefreshBlock(currentBlock)`, `isRefreshBlockSetUseful(blocks)`,
  `scoreRefreshBlockSet(blocks)`.
- **Carry-over** — `prepareTeamCarryOverBlocks()`.

## Depends on
- Internal: [[Game Config]] (direct `require`); [[Game Engine]] for room
  state (`engine.room`) and for cross-calls between its own functions (e.g.
  `dealOpeningHands` calls `trimInventory` through the engine facade).
- External: none.

## Notes
- Called from [[Game Engine]]'s `startLevel()` (`buildDrawPile`,
  `dealOpeningHands`), `placeBlock()` (`refillPlayerBlock`),
  `refreshBlocks()` (`generateRefreshBlocks`), and `completeLevel()`
  (`prepareTeamCarryOverBlocks`); also reached from [[Balance Simulator]]
  indirectly through the same `GameEngine` facade.
- Blocks are objects `{ id, shapeId, cells, height }`; `height` is derived
  from the vertical span of `cells`. Legacy numeric blocks are still
  interpreted as plain height values. Sizes unlock through [[Game Config]],
  so level 1 starts with height-1 `I1` blocks only.
- Inventory active-slot count scales through [[Game Config]] (1 slot at
  level 1, 2 at level 2, 3 at level 4 by default).
- Draw pile: built from unused team carry-over blocks plus generated reserve
  blocks unlocked by level. Level 1 starts with an empty pile and levels 1–3
  have no generated reserve.
- Team carry-over: on level completion, unused hand + remaining pile blocks
  are collected; up to 3 small precision-friendly blocks are kept and
  shuffled into the next level's pile. Discarded entirely on level failure,
  before the Impact restart ([[Game Engine]] never calls
  `prepareTeamCarryOverBlocks` on the failure path).
- Refresh generation upgrades size 1–2 blocks into unlocked size 3+ blocks
  when possible, reshapes size 3+ blocks without changing size, and tries to
  produce a useful remaining-height option — it never consumes or reorders
  the draw pile. There is no token/cooldown/lockout gating around *when* a
  refresh is allowed anymore; it fires unconditionally whenever a player
  activates a held `refresh` Power item, from [[Game Engine]]'s
  `activatePower()`.
