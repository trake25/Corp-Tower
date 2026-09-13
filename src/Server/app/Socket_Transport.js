const OPEN = 1;

function isOpenSocket(ws) {
    return Boolean(
        ws &&
        ws.readyState === OPEN &&
        typeof ws.send === "function"
    );
}

function reportTransportFailure(context, error) {
    console.error(`${context} failed:`, error?.message || error);
}

function safeSend(ws, payload, context = "WebSocket send") {
    if (!isOpenSocket(ws)) {
        return false;
    }

    try {
        const result = ws.send(payload, error => {
            if (error) {
                reportTransportFailure(context, error);
            }
        });

        if (result && typeof result.then === "function") {
            Promise.resolve(result).catch(error => {
                reportTransportFailure(context, error);
            });
        }

        return true;
    } catch (error) {
        reportTransportFailure(context, error);
        return false;
    }
}

function safeSendJson(ws, data, context = "WebSocket JSON send") {
    let payload;

    try {
        payload = JSON.stringify(data);
    } catch (error) {
        reportTransportFailure(context, error);
        return false;
    }

    return safeSend(ws, payload, context);
}

function safeClose(ws, code, reason, context = "WebSocket close") {
    if (
        !ws ||
        ws.readyState !== OPEN ||
        typeof ws.close !== "function"
    ) {
        return false;
    }

    try {
        ws.close(code, reason);
        return true;
    } catch (error) {
        reportTransportFailure(context, error);
        return false;
    }
}

module.exports = {
    isOpenSocket,
    safeClose,
    safeSend,
    safeSendJson
};
