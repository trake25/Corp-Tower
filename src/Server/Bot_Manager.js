// Bot_Manager.js

const GameConfig =
    require("./Game_Config");

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

            console.log(
                `${bot.id} BOT PLAY`
            );

            engine.placeBlock(
                bot.id,
                0
            );

            this.runBotLoop(
                bot,
                engine,
                level
            );

        }, delay);

    }

}

module.exports =
    new BotManager();
