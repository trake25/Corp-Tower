import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appIdInjection = "TOD_FACEBOOK_APP_ID: ${{ vars.TOD_FACEBOOK_APP_ID || '' }}";

function workflow(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function assertWebFacebookBuildContract(contents, environment) {
  const environmentMarker = `environment: ${environment}`;
  const verify = `Verify Supabase ${environment} environment`;
  const exportConfig = 'run: scripts/write-endpoint-config.sh';

  assert.ok(contents.includes(environmentMarker));
  assert.ok(contents.includes(appIdInjection));
  assert.ok(contents.includes(verify));
  assert.ok(contents.includes(exportConfig));
  assert.ok(contents.indexOf(verify) < contents.indexOf(exportConfig));
  assert.ok(contents.indexOf(appIdInjection) < contents.indexOf(exportConfig));
  assert.doesNotMatch(contents, /TOD_FACEBOOK_CLIENT_TOKEN/);
  assert.doesNotMatch(contents, /TOD_FACEBOOK_APP_SECRET/);
}

test('EKS Web injects only the production public Facebook App ID after its Supabase guard', () => {
  assertWebFacebookBuildContract(
    workflow('.github/workflows/EKS-Deploy-Web-Server.yml'),
    'production',
  );
});

test('Backup Web injects only the development public Facebook App ID after its Supabase guard', () => {
  assertWebFacebookBuildContract(
    workflow('.github/workflows/Backup-Deploy-Web-Server.yml'),
    'development',
  );
});

test('game-server deployments bind Facebook code exchange to their paired Web origin', () => {
  const backup = workflow('scripts/backup/backup-server-up.sh');
  const eks = workflow('.github/workflows/EKS-Deploy-Game-Server.yml');

  assert.match(backup, /1\) FACEBOOK_WEB_ORIGIN="https:\/\/devtod1\.galaxxigames\.com"/);
  assert.match(backup, /2\) FACEBOOK_WEB_ORIGIN="https:\/\/devtod2\.galaxxigames\.com"/);
  assert.match(backup, /3\) FACEBOOK_WEB_ORIGIN="https:\/\/toddemo\.galaxxigames\.com"/);
  assert.match(backup, /-e "FACEBOOK_WEB_ORIGIN=\$\{FACEBOOK_WEB_ORIGIN\}"/);
  assert.match(eks, /FACEBOOK_WEB_ORIGIN=https:\/\/todplay\.galaxxigames\.com/);
  assert.match(eks, /name: FACEBOOK_WEB_ORIGIN/);
  assert.match(eks, /printenv FACEBOOK_WEB_ORIGIN/);
});
