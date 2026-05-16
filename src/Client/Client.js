// client.js

const connectButton =
    document.getElementById("connectButton");

const sendButton =
    document.getElementById("sendButton");

const statusText =
    document.getElementById("status");

let socket = null;

// Connect to websocket server
connectButton.addEventListener("click", () => {

    socket = new WebSocket(
        "ws://13.229.227.24:3000"
    );

    statusText.textContent =
        "Connecting...";

    // Connected successfully
    socket.onopen = () => {

        console.log(
            "Connected to server"
        );

        statusText.textContent =
            "Connected";
    };

    // Receive message from server
    socket.onmessage = (event) => {

        const data =
            JSON.parse(event.data);

        console.log(data);

        // Room successfully created
        if (data.type === "room_created") {

            statusText.textContent =
                `Room ${data.roomId} Joined`;

            console.log(
                "Level:",
                data.level
            );

            console.log(
                "Target Height:",
                data.targetHeight
            );

            console.log(
                "Your Blocks:",
                data.blocks
            );
        }

        // Broadcast game state
        if (data.type === "game_state") {

            console.log(
                "=== GAME STATE ==="
            );

            console.log(
                "Level:",
                data.level
            );

            console.log(
                "Height:",
                data.currentHeight,
                "/",
                data.targetHeight
            );

            console.log(
                "Players:"
            );

            data.players.forEach(player => {

                console.log(
                    player.id,
                    "Score:",
                    player.score,
                    "Blocks:",
                    player.blocks
                );

            });

        }

    };

    // Disconnected
    socket.onclose = () => {

        console.log(
            "Disconnected from server"
        );

        statusText.textContent =
            "Disconnected";
    };

});

// Temporary test button
sendButton.addEventListener("click", () => {

    if (!socket) {

        console.log(
            "Not connected"
        );

        return;
    }

    const message = {

        type: "place_block"
    };

    socket.send(
        JSON.stringify(message)
    );

    console.log(
        "place_block sent"
    );

});