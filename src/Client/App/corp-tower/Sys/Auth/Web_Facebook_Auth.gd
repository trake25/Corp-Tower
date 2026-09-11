class_name WebFacebookAuth
extends RefCounted

const BRIDGE_KEY := "__corpTowerFacebookAuth"
const SDK_ID := "corp-tower-facebook-sdk"
const SDK_URL := "https://connect.facebook.net/en_US/sdk.js"
# Meta SDK versions are pinned so provider behavior does not change merely because the
# hosted SDK advances. Update this alongside the provider-configuration runbook.
const SDK_VERSION := "v22.0"

const STATUS_STARTED := "started"
const STATUS_UNAVAILABLE := "unavailable"
const STATUS_REJECTED := "rejected"

func initialize(app_id: String) -> String:
	if app_id.strip_edges() == "":
		return STATUS_UNAVAILABLE

	return str(_evaluate_json(_initialize_script(app_id)).get("status", STATUS_UNAVAILABLE))

func begin_login() -> String:
	return str(_evaluate_json(_begin_login_script()).get("status", STATUS_UNAVAILABLE))

func take_login_result() -> Dictionary:
	return _evaluate_json(_take_login_result_script())

func _evaluate_json(script: String) -> Dictionary:
	var parsed = JSON.parse_string(str(JavaScriptBridge.eval(script, true)))
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}

func _initialize_script(app_id: String) -> String:
	return """
(function () {
  const key = %s;
  const appId = %s;
  const existing = window[key];
  if (existing && existing.appId === appId) {
    return JSON.stringify({ status: existing.status || "loading" });
  }

  const bridge = { appId: appId, status: "loading", result: null, loginPending: false };
  window[key] = bridge;
  const ready = function () {
    try {
      if (!window.FB) throw new Error("Facebook SDK unavailable");
      window.FB.init({ appId: appId, cookie: true, xfbml: false, version: %s });
      bridge.status = "ready";
    } catch (_) {
      bridge.status = "failed";
    }
  };

  if (window.FB) {
    ready();
  } else {
    let script = document.getElementById(%s);
    if (!script) {
      script = document.createElement("script");
      script.id = %s;
      script.async = true;
      script.defer = true;
      script.src = %s;
      script.onload = ready;
      script.onerror = function () { bridge.status = "failed"; };
      document.head.appendChild(script);
    } else {
      script.addEventListener("load", ready, { once: true });
      script.addEventListener("error", function () { bridge.status = "failed"; }, { once: true });
    }
  }
  return JSON.stringify({ status: bridge.status });
})()
""" % [
		JSON.stringify(BRIDGE_KEY), JSON.stringify(app_id), JSON.stringify(SDK_VERSION),
		JSON.stringify(SDK_ID), JSON.stringify(SDK_ID), JSON.stringify(SDK_URL)
	]

func _begin_login_script() -> String:
	return """
(function () {
  const bridge = window[%s];
  if (!bridge || bridge.status !== "ready" || !window.FB || bridge.loginPending) {
    return JSON.stringify({ status: "unavailable" });
  }

  bridge.result = null;
  bridge.loginPending = true;
  try {
    window.FB.login(function (response) {
      bridge.loginPending = false;
      const auth = response && response.authResponse;
      if (!auth || response.status !== "connected") {
        bridge.result = { reason: response && response.status === "unknown" ? "cancelled" : "rejected" };
        return;
      }
      bridge.result = {
        access_token: String(auth.accessToken || ""),
        expires_in: Number(auth.expiresIn || 0)
      };
    }, { scope: "public_profile", auth_type: "reauthenticate" });
    return JSON.stringify({ status: "started" });
  } catch (_) {
    bridge.loginPending = false;
    return JSON.stringify({ status: "rejected" });
  }
})()
""" % JSON.stringify(BRIDGE_KEY)

func _take_login_result_script() -> String:
	return """
(function () {
  const bridge = window[%s];
  if (!bridge || !bridge.result) return JSON.stringify({});
  const result = bridge.result;
  bridge.result = null;
  return JSON.stringify(result);
})()
""" % JSON.stringify(BRIDGE_KEY)
