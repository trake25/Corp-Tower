// Bot_Manager.js

const GameConfig =
    require("./Game_Config");

class BotManager {

    startBots(engine) {

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

                this.runBotLoop(
                    player,
                    engine
                );

            });
    }


    runBotLoop(
        bot,
        engine
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


        setTimeout(() => {

            if (
                engine.room.state
                !== "playing"
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
                engine
            );

        }, delay);

    }

}

module.exports =
    new BotManager();