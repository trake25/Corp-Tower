import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function source(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function functionBody(contents, name, nextName) {
  const start = contents.indexOf(`func ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = nextName ? contents.indexOf(`func ${nextName}`, start + 1) : contents.length;
  return contents.slice(start, end === -1 ? contents.length : end);
}

test('Web Facebook starts a same-tab manual OAuth flow and does not initialize the JS SDK', () => {
  const contents = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const ready = functionBody(contents, '_ready()', '_setup_deeplink');
  const begin = functionBody(contents, '_begin_web_facebook_login', '_build_web_facebook_authorize_url');

  assert.doesNotMatch(ready, /_setup_web_facebook\(\)/);
  assert.match(begin, /_build_web_facebook_authorize_url/);
  assert.match(begin, /_web_oauth_navigation_script/);
  assert.doesNotMatch(begin, /\.begin_login\(/);
  assert.match(contents, /https:\/\/www\.facebook\.com\/v22\.0\/dialog\/oauth/);
  assert.match(contents, /response_type=code/);
  assert.match(contents, /state=%s/);
});

test('Web Facebook callback exchanges the authorization code through the game server', () => {
  const auth = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const verifier = source('src/Server/app/Auth_Verifier.js');
  const server = source('src/Server/app/Server.js');

  assert.match(auth, /\/api\/auth\/facebook\/exchange/);
  assert.match(auth, /"code": code, "redirectUri": redirect_to/);
  assert.match(verifier, /exchangeFacebookAuthorizationCode/);
  assert.match(verifier, /oauth\/access_token/);
  assert.match(verifier, /client_secret/);
  assert.match(server, /\/api\/auth\/facebook\/exchange/);
  assert.match(server, /exchangeFacebookAuthorizationCode/);
  assert.match(server, /Cache-Control.*no-store/);
});

test('Web linking stages the verified Facebook token without replacing the Guest before commit', () => {
  const contents = source('src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd');
  const callback = functionBody(contents, '_consume_web_facebook_callback', '_finish_web_facebook_callback');

  assert.match(callback, /pre_link_user_id != user_id/);
  assert.match(callback, /not is_anonymous/);
  assert.match(callback, /_stage_native_facebook_link_credential/);
  assert.doesNotMatch(callback, /_store_facebook_session\(access_token, expires_at\).*FLOW_FACEBOOK_LINK_PREFLIGHT/s);
});
