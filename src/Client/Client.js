const connectButton =
    document.getElementById("connectButton");

const statusText =
    document.getElementById("status");

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