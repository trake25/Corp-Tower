// Game_Engine.js

const GameConfig = require("./Game_Config");

class GameEngine {

    // =========================
    // CONSTRUCTOR
    // =========================

    constructor() {
        this.room = null;
    }

    // =========================
    // BROADCAST SYSTEM
    // =========================

    broadcastGameState() {

        const gameState = {

            type: "game_state",

            level: this.room.level,

            currentHeight:
                this.room.currentHeight,

            targetHeight:
                this.room.targetHeight,

            players: this.room.players.map(player => ({

                id: player.id,

                score: player.score,

                blocks: player.blocks

            }))
        };

        this.room.players.forEach(player => {

            player.ws.send(
                JSON.stringify(gameState)
            );

        });

    }

    // =========================
    // ROOM SYSTEM
    // =========================

    createRoom(players) {

        this.room = {
            players: players,
            level: 1,
            targetHeight: 3,
            currentHeight: 0,
            state: "waiting"
        };

        console.log("Room created:", this.room);
    }

    startLevel() {

        this.room.state = "playing";

        console.log("Level started:", this.room.level);

        this.assignBlocks();
    }

    // =========================
    // BLOCK SYSTEM
    // =========================

    getRandomBlock() {

        let availableBlocks = {
            1: GameConfig.blockWeights[1],
            2: GameConfig.blockWeights[2],
            3: GameConfig.blockWeights[3]
        };

        // Unlock higher blocks based on level
        for (const block in GameConfig.blockUnlockLevels) {

            const unlockLevel =
                GameConfig.blockUnlockLevels[block];

            if (this.room.level >= unlockLevel) {

                availableBlocks[block] =
                    GameConfig.blockWeights[block];
            }
        }

        // Build weighted pool
        const weightedPool = [];

        for (const block in availableBlocks) {

            const weight = availableBlocks[block];

            for (let i = 0; i < weight; i++) {
                weightedPool.push(Number(block));
            }
        }

        // Pick random block
        const randomIndex =
            Math.floor(Math.random() * weightedPool.length);

        return weightedPool[randomIndex];
    }

    assignBlocks() {

        let blocksPerPlayer = 1;

        // Inventory scaling
        for (const level in GameConfig.inventoryScaling) {

            if (this.room.level >= Number(level)) {

                blocksPerPlayer =
                    GameConfig.inventoryScaling[level];
            }
        }

        this.room.players.forEach(player => {

            player.blocks = [];

            for (let i = 0; i < blocksPerPlayer; i++) {

                const block = this.getRandomBlock();

                player.blocks.push(block);
            }

            console.log(`${player.id} blocks:`, player.blocks);
        });
    }

    placeBlock(playerId) {

        if (this.room.state !== "playing") {

            console.log("Cannot place block, level not active");

            return;
        }

        const player =
            this.room.players.find(p => p.id === playerId);

        if (!player) {

            console.log("Player not found");

            return;
        }

        if (!player.blocks || player.blocks.length === 0) {

            console.log(`${player.id} has no blocks`);

            return;
        }

        // Remove first block from inventory
        const block = player.blocks.shift();

        // Add height
        this.room.currentHeight += block;

        // Add score
        this.addScore(player, block);

        console.log(`${player.id} placed block (${block})`);

        console.log(
            "Current Height:",
            this.room.currentHeight
        );

        this.broadcastGameState();

        this.checkWinCondition();

        if (this.room.state === "playing") {
            this.checkFailCondition();
        }
    }

    // =========================
    // GAME RULES
    // =========================

    checkWinCondition() {

        if (
            this.room.currentHeight >=
            this.room.targetHeight
        ) {

            console.log(
                "TARGET REACHED. LEVEL COMPLETED."
            );

            this.room.state = "finished";

            this.showScoreboard();

            this.showLevelMVP();

            this.nextLevel();
        }
    }

    checkFailCondition() {

        const allEmpty =
            this.room.players.every(player => {

                return (
                    !player.blocks ||
                    player.blocks.length === 0
                );
            });

        if (
            allEmpty &&
            this.room.currentHeight <
            this.room.targetHeight
        ) {

            this.showScoreboard();

            this.showLevelMVP();

            console.log(
                "Level FAILED. Target Height not reached. All Players no longer have blocks."
            );

            this.room.state = "failed";
        }
    }

    // =========================
    // GAME FLOW
    // =========================

    shufflePlayers(players) {

        return players.sort(
            () => Math.random() - 0.5
        );
    }

    simulateGame() {

        console.log("\n--- SIMULATION START ---");

        while (this.room.state === "playing") {

            // Shuffle placement order
            const shuffled =
                this.shufflePlayers(
                    [...this.room.players]
                );

            for (let player of shuffled) {

                if (this.room.state !== "playing") {
                    break;
                }

                // Skip empty players
                if (
                    !player.blocks ||
                    player.blocks.length === 0
                ) {
                    continue;
                }

                this.placeBlock(player.id);
            }
        }

        console.log("--- SIMULATION END ---\n");
    }

    nextLevel() {

        if (
            this.room.level >=
            GameConfig.maxLevel
        ) {

            console.log("\nGAME COMPLETED!");

            this.room.state = "game_completed";

            return;
        }

        // Increase level
        this.room.level += 1;

        // Reset tower
        this.room.currentHeight = 0;

        // Calculate new target
        this.room.targetHeight =
            this.room.level *
            GameConfig.targetHeightMultiplier;

        // Start level
        this.room.state = "playing";

        console.log(
            `\n=== LEVEL ${this.room.level} START ===`
        );

        console.log(
            `Target Height: ${this.room.targetHeight}`
        );

        this.assignBlocks();
    }

    // =========================
    // SCORE SYSTEM
    // =========================

    addScore(player, block) {

        const points =
            block * this.room.level;

        player.score += points;

        console.log(
            `${player.id} gained ${points} score`
        );
    }

    showLevelMVP() {

        let mvp = this.room.players[0];

        this.room.players.forEach(player => {

            if (player.score > mvp.score) {
                mvp = player;
            }
        });

        console.log(
            `Current Game MVP: ${mvp.id} (${mvp.score} score)`
        );
    }

    showScoreboard() {

        console.log("\n=== SCOREBOARD ===");

        this.room.players.forEach(player => {

            console.log(
                `${player.id}: ${player.score}`
            );
        });
    }
}

module.exports = GameEngine;

// =========================
// SIMULATION
// =========================

/*
const engine = new GameEngine();


const players = [
    { id: "P1", score: 0 },
    { id: "P2", score: 0 },
    { id: "P3", score: 0 }
];

engine.createRoom(players);

engine.startLevel();

engine.simulateGame();
*/