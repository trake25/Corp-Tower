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

test('Mobile Web Facebook fresh sign-in uses Supabase PKCE in the initiating tab', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const signIn = functionBody(auth, 'sign_in_with_provider', '_is_mobile_web_facebook_runtime');
  const mobileFresh = functionBody(auth, '_sign_in_with_mobile_web_facebook', 'facebook_link_route');
  const browser = functionBody(auth, '_sign_in_with_browser', 'link_with_provider');
  const navigation = functionBody(auth, '_web_oauth_navigation_script', '_provider_account_selection_query');

  assert.match(signIn, /if provider == "facebook" and _is_mobile_web_facebook_runtime\(\):/);
  assert.match(signIn, /return _sign_in_with_mobile_web_facebook\(\)/);
  assert.match(signIn, /return _sign_in_with_web_facebook\(\)/);
  assert.match(mobileFresh, /_generate_code_verifier\(\)/);
  assert.match(mobileFresh, /_save_verifier\(verifier\)/);
  assert.match(mobileFresh, /_build_authorize_url\(\s*"facebook"/);
  assert.match(mobileFresh, /_web_oauth_navigation_script\(url\)/);
  assert.doesNotMatch(mobileFresh, /_mark_web_oauth_navigation_started|oauth_in_flight/);
  assert.match(browser, /_build_authorize_url\(/);
  assert.match(browser, /_mark_web_oauth_navigation_started\(provider, FLOW_SIGN_IN\)/);
  assert.match(navigation, /window\.location\.replace/);
  assert.doesNotMatch(navigation, /window\.open/);
});

test('Mobile Web Facebook linking uses the authenticated Supabase link route and stages before commit', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const link = functionBody(auth, 'link_with_provider', 'begin_facebook_link_preflight');
  const mobileLink = functionBody(auth, '_begin_mobile_web_facebook_link', '_begin_browser_link');
  const browserLink = functionBody(auth, '_begin_browser_link', '_expire_oauth_after_grace');
  const linkPath = functionBody(auth, '_build_link_authorize_path', '_generate_code_verifier');
  const callback = functionBody(auth, 'consume_web_callback', 'take_oauth_error');
  const linkCallback = functionBody(auth, '_consume_link_callback', '_recover_existing_google_link');
  const staging = functionBody(auth, '_stage_link_session', '_stage_native_facebook_link_credential');

  assert.match(link, /_save_link_flow\(provider, user_id\)/);
  assert.match(link, /provider == "facebook" and not _is_mobile_web_facebook_runtime\(\)/);
  assert.match(link, /return await _begin_mobile_web_facebook_link\(\)/);
  assert.match(mobileLink, /return await _begin_browser_link\("facebook", false\)/);
  assert.match(browserLink, /_build_link_authorize_path\(/);
  assert.match(linkPath, /\/auth\/v1\/user\/identities\/authorize/);
  assert.match(browserLink, /_get_auth_authenticated\(path, access_token\(\)\)/);
  assert.match(browserLink, /if arm_web_oauth_navigation:\s*_mark_web_oauth_navigation_started\(provider, FLOW_LINK\)\s*else:\s*web_oauth_navigation_started\.emit\(provider, FLOW_LINK\)/);
  assert.doesNotMatch(mobileLink, /_mark_web_oauth_navigation_started|oauth_in_flight/);
  assert.ok(
    callback.indexOf('_has_active_link_flow()') < callback.indexOf('_exchange_code('),
    'an active provider-link callback must be handled before a fresh sign-in exchange'
  );
  assert.match(linkCallback, /return REASON_IDENTITY_CONFLICT/);
  assert.match(staging, /str\(user\.get\("id", ""\)\) != str\(flow\.get\("pre_link_user_id", ""\)\)/);
  assert.match(staging, /pending_link_session = data\.duplicate\(true\)/);
  assert.doesNotMatch(staging, /_store_session/);
});

test('PC Web retains its direct Facebook code-exchange path and Android retains native linking', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const route = functionBody(auth, '_facebook_link_route_for_runtime', '_sign_in_with_web_facebook');
  const pcLink = functionBody(auth, 'begin_facebook_link_preflight', 'complete_facebook_link_after_preflight');
  const verifier = source('src/Server/app/Auth_Verifier.js');
  const server = source('src/Server/app/Server.js');

  assert.match(route, /FACEBOOK_LINK_ROUTE_WEB_PC/);
  assert.match(route, /FACEBOOK_LINK_ROUTE_WEB_MOBILE/);
  assert.match(route, /FACEBOOK_LINK_ROUTE_NATIVE/);
  assert.match(pcLink, /FACEBOOK_LINK_ROUTE_WEB_PC/);
  assert.match(pcLink, /_begin_web_facebook_login\(FLOW_FACEBOOK_LINK_PREFLIGHT\)/);
  assert.match(pcLink, /FACEBOOK_LINK_ROUTE_NATIVE/);
  assert.match(auth, /\/api\/auth\/facebook\/exchange/);
  assert.match(auth, /"code": code, "redirectUri": redirect_to/);
  assert.match(verifier, /exchangeFacebookAuthorizationCode/);
  assert.match(server, /FACEBOOK_WEB_ORIGIN/);
  assert.match(server, /redirectOriginMatchesRequest\(req, redirectUri, expectedWebOrigin\)/);
  assert.match(server, /requestOriginMatchesExpected\(req\)/);
});

test('ScreenManager gives Mobile Web linking the normal same-tab lifecycle', () => {
  const screen = source('src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd');
  const initial = functionBody(screen, '_show_initial_screen', '_begin_authenticated_startup');
  const navigation = functionBody(screen, '_handle_web_oauth_navigation', '_provider_link_stage_after_eligibility');
  const stages = functionBody(screen, '_provider_link_stage_after_eligibility', '_on_facebook_link_credential_ready');

  assert.match(navigation, /provider_link_browser_round_trip_active = true/);
  assert.match(navigation, /_clear_account_link_readiness\(\)/);
  assert.match(stages, /FACEBOOK_LINK_ROUTE_WEB_PC[\s\S]*"web_facebook_oauth"/);
  assert.match(stages, /FACEBOOK_LINK_ROUTE_WEB_MOBILE[\s\S]*"launch"/);
  assert.match(stages, /FACEBOOK_LINK_ROUTE_NATIVE[\s\S]*"facebook_native_credential"/);
  assert.ok(
    initial.indexOf('AuthManager.has_provider_link_result()') < initial.indexOf('if restored:'),
    'a staged provider-link callback must resume Account before ordinary startup'
  );
  assert.doesNotMatch(screen, /mobile_web_facebook_auth_tab|MOBILE_AUTH_TAB|_keeps_account_link_connection_for_web_oauth/);
});

test('Relay-only code and export artifacts are absent', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const buildAction = source('.github/actions/build-godot-web/action.yml');

  assert.equal(
    existsSync(pathFromRoot('src/Client/App/corp-tower/Web/facebook-oauth-callback.html')),
    false,
    'the obsolete relay must be removed once no route uses it'
  );
  assert.doesNotMatch(auth, /WEB_FACEBOOK_AUTH_TAB|BroadcastChannel|window\.open|auth_tab/);
  assert.doesNotMatch(buildAction, /facebook-oauth-callback\.html|Facebook OAuth relay/);
  assert.equal(
    existsSync(pathFromRoot('src/Client/App/corp-tower/Sys/Auth/Web_Facebook_Auth.gd')),
    false,
    'the unused SDK helper must stay absent'
  );
  assert.doesNotMatch(auth, /WebFacebookAuth|window\.FB|FB\.login|_setup_web_facebook/);
});
