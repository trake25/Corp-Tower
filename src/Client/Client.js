const connectButton =
    document.getElementById("connectButton");

const statusText =
    document.getElementById("status");

const sendButton =
    document.getElementById("sendButton");

let socket = null;

connectButton.addEventListener("click", () => {

    socket = new WebSocket(
        "ws://46.137.224.175:3000"
    );

    statusText.textContent =
        "Connecting...";

    socket.onopen = () => {

        console.log("Connected to server");

        statusText.textContent =
            "Connected";
    };

    socket.onclose = () => {

        console.log("Disconnected");

        statusText.textContent =
            "Disconnected";
    };

});

sendButton.addEventListener("click", () => {

    if (!socket) {

        console.log("Not connected");

        return;
    }

    const message = {

        type: "test_message",

        text: "Hello from browser"
    };

    socket.send(
        JSON.stringify(message)
    );

    console.log("Message sent");
});