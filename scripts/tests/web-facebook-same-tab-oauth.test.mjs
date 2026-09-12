import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function pathFromRoot(path) {
  return resolve(ROOT, path);
}

function source(path) {
  return readFileSync(pathFromRoot(path), 'utf8');
}

function functionBody(contents, name, nextName) {
  const start = contents.indexOf(`func ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = nextName ? contents.indexOf(`func ${nextName}`, start + 1) : contents.length;
  return contents.slice(start, end === -1 ? contents.length : end);
}

function relayScript(html) {
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/i);
  assert.ok(match, 'relay must contain an inline handoff script');
  return match[1];
}

test('Mobile Web Facebook opens a same-origin auth tab while PC retains its same-tab route', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const begin = functionBody(auth, '_begin_web_facebook_login', '_open_web_facebook_auth_tab');
  const openAuthTab = functionBody(auth, '_open_web_facebook_auth_tab', '_build_web_facebook_authorize_url');
  const route = functionBody(auth, '_facebook_link_route_for_runtime', 'is_web_facebook_link_route');

  assert.match(route, /FACEBOOK_LINK_ROUTE_WEB_PC/);
  assert.match(route, /FACEBOOK_LINK_ROUTE_WEB_MOBILE_AUTH_TAB/);
  assert.match(route, /FACEBOOK_LINK_ROUTE_NATIVE/);
  assert.match(begin, /WEB_FACEBOOK_TOPOLOGY_AUTH_TAB/);
  assert.match(begin, /_mobile_web_facebook_redirect_uri/);
  assert.match(begin, /_open_web_facebook_auth_tab/);
  assert.match(begin, /_web_oauth_navigation_script/);
  assert.match(openAuthTab, /window\.open\(%s, "corp_tower_facebook_auth_"/);
  assert.doesNotMatch(openAuthTab, /FACEBOOK_WEB_AUTH_URL/);
  assert.match(auth, /WEB_FACEBOOK_AUTH_TAB_PATH := "\/facebook-oauth-callback.html"/);
});

test('The obsolete Web Facebook SDK helper and SDK calls are absent', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');

  assert.equal(
    existsSync(pathFromRoot('src/Client/App/corp-tower/Sys/Auth/Web_Facebook_Auth.gd')),
    false,
    'the unused SDK helper must be deleted after callers are removed'
  );
  assert.doesNotMatch(auth, /WebFacebookAuth|window\.FB|FB\.login|_setup_web_facebook/);
});

test('The relay is a syntax-valid same-origin callback handoff with no token authority', () => {
  const relay = source('src/Client/App/corp-tower/Web/facebook-oauth-callback.html');
  const script = relayScript(relay);

  assert.doesNotThrow(() => new Function(script), 'relay JavaScript must parse before export');
  assert.match(script, /window\.localStorage/);
  assert.match(script, /FLOW_PREFIX \+ transaction/);
  assert.match(script, /RESULT_PREFIX \+ transaction/);
  assert.match(script, /flow\.origin !== window\.location\.origin/);
  assert.match(script, /flow\.redirect_uri !== window\.location\.origin \+ window\.location\.pathname/);
  assert.match(script, /flow\.expires_at_unix <= Date\.now\(\) \/ 1000/);
  assert.match(script, /window\.location\.replace\(flow\.authorize_url\)/);
  assert.match(script, /window\.opener\.postMessage\(envelope, window\.location\.origin\)/);
  assert.match(script, /new BroadcastChannel\(CHANNEL\)/);
  assert.match(script, /window\.localStorage\.removeItem\(FLOW_PREFIX \+ transaction\)/);
  assert.match(script, /window\.setTimeout\(\(\) => window\.close\(\), 0\)/);
  assert.doesNotMatch(script, /access_token|app_secret|Godot|FB\.login/i);
});

test('The original tab consumes only a bound, unexpired, one-time callback result', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const callback = functionBody(auth, '_consume_web_facebook_callback', '_finish_web_facebook_callback');
  const poll = functionBody(auth, '_poll_web_facebook_auth_tab', '_finish_web_facebook_auth_tab_failure');

  assert.match(callback, /callback_state != expected_state/);
  assert.match(callback, /flow_expired/);
  assert.match(callback, /_web_url_origin\(redirect_to\) != expected_origin/);
  assert.match(callback, /current_origin != expected_origin/);
  assert.match(callback, /callback_origin != expected_origin/);
  assert.match(callback, /_clear_web_facebook_flow\(\)/);
  assert.match(callback, /_exchange_web_facebook_code\(code, redirect_to\)/);
  assert.match(poll, /_take_web_facebook_auth_tab_result/);
  assert.match(poll, /_has_active_web_facebook_auth_tab_flow/);
  assert.match(poll, /_web_facebook_auth_tab_status\(\) != "open"/);
});

test('Web Facebook exchange remains server-authoritative and origin-bound to its deployment', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const verifier = source('src/Server/app/Auth_Verifier.js');
  const server = source('src/Server/app/Server.js');

  assert.match(auth, /\/api\/auth\/facebook\/exchange/);
  assert.match(auth, /"code": code, "redirectUri": redirect_to/);
  assert.match(verifier, /exchangeFacebookAuthorizationCode/);
  assert.match(verifier, /oauth\/access_token/);
  assert.match(verifier, /client_secret/);
  assert.match(server, /FACEBOOK_WEB_ORIGIN/);
  assert.match(server, /redirectOriginMatchesRequest\(req, redirectUri, expectedWebOrigin\)/);
  assert.match(server, /requestOriginMatchesExpected\(req\)/);
  assert.doesNotMatch(server, /Access-Control-Allow-Origin": "\*"/);
});

test('The Account lifecycle keeps mobile auth-tab linking loaded and preserves Android preflight', () => {
  const screen = source('src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd');

  assert.match(screen, /provider_link_stage = "web_facebook_oauth"/);
  assert.match(screen, /_keeps_account_link_connection_for_web_oauth/);
  assert.match(screen, /FACEBOOK_LINK_ROUTE_WEB_MOBILE_AUTH_TAB/);
  assert.match(screen, /"facebook_native_credential"/);
  assert.doesNotMatch(screen, /FACEBOOK_LINK_ROUTE_WEB_SDK|"facebook_credential"/);
});

test('The shared Web export copies the relay to the public artifact root', () => {
  const buildAction = source('.github/actions/build-godot-web/action.yml');

  assert.match(buildAction, /Web\/facebook-oauth-callback\.html/);
  assert.match(buildAction, /\$OUTPUT_DIR\/facebook-oauth-callback\.html/);
  assert.match(buildAction, /Facebook OAuth relay was not copied into the Web export/);
});
