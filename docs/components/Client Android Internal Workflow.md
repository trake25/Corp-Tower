# Client Android Internal Workflow

## Purpose
- Manual Android build and Google Play internal testing workflow.
- File: `.github/workflows/Client-Android-Internal.yml`.

## Responsibilities
- Run on the pinned GitHub runner image `ubuntu-24.04`.
- Fetch private art into `Cor/Art` before any Godot step ([[Private Asset Pipeline]]).
- Download Godot `4.6.2.stable` Linux.
- Install Android SDK packages through `android-actions/setup-android`.
- Resolve the next Android version code from Google Play.
- Restore release keystore from secrets (`ANDROID_RELEASE_KEYSTORE_ALIAS`,
  `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `ANDROID_RELEASE_KEYSTORE_BASE64`).
- Import/parse Godot project.
- Run the always-on Godot client compile/startup smoke test.
- Run required GUT tests.
- Install the generated Android build template in CI and export signed Android AAB.
- Validate the signed AAB deployment artifact before upload.
- Upload AAB artifact.
- Optionally upload to Google Play internal track.
- Verify the Google Play internal track contains the resolved version code after upload.
- Remove the fetched art from the runner in an `if: always()` step.

## Key Logic
- Trigger: manual `workflow_dispatch`.
- Inputs:
  - `version_code_override`
  - `version_name`
  - `upload_to_play`
  - `art_version_override` — optional, testing only; skips asset sha256 verification and must never be used for a Play release ([[Private Asset Pipeline]])
- Version code:
  - Authenticates to the Google Play Android Publisher API using `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
  - Creates a temporary edit and reads every track for `com.galaxxigames.corptower`.
  - Uses the highest release `versionCodes[]` value across all tracks plus one.
  - Uses `1` when no Google Play release exists yet.
  - Allows `version_code_override` only when it is a positive integer greater than the detected Google Play maximum.
- Runner/action runtime:
  - Uses Node 24-compatible GitHub Action majors.
  - Avoids deprecated Node 20 compatibility flags.
  - Android SDK license acceptance is handled by the setup action instead of a manual shell pipe.
  - Android command-line tools are provided by the setup action; CI installs only the specific Android platform/build/NDK/CMake packages it needs.
- Android export:
  - The CI preset uses Godot's Gradle Android build path for AAB export.
  - CI installs the Android build template during the headless export command with `--install-android-build-template`.
  - CI writes a valid Godot `EditorSettings` resource so Godot can read the Android SDK and Java SDK paths without parse warnings.
  - The generated Android build template is not committed to the repository.
- Deployment tests:
  - `res://Tests/CiSmokeTest.gd` loads application scripts under committed code roots `Cor` and `Sys`, then fails the workflow if the configured main scene, `NetworkManager` autoload, the [[Game UI Scene]], scene instantiation, or main-scene ready wiring is broken.
  - The exported AAB must be non-empty, pass zip integrity validation, contain the expected bundle config and base manifest, include `arm64-v8a` native libraries, exclude disabled native architectures, and pass Java signature verification.
  - When `upload_to_play` is true, the workflow creates a fresh Google Play edit after upload and verifies the internal track lists the resolved `ANDROID_VERSION_CODE`.
- GUT step:
  - Runs after project import and the smoke test.
  - Runs before signed export.
  - Requires `addons/gut/gut_cmdln.gd`.
  - Runs tests under `res://Tests/Gut` with subdirectories included.
  - Fails the workflow when the addon is missing or a GUT test fails.

## Inputs/Outputs
- Input: GitHub secrets, manual version name, and optional version code override.
- Output: validated signed `CorpTower.aab`, optional verified Google Play internal release.

## Dependencies
- [[Godot Client App]]
- [[Private Asset Pipeline]]
- `.github/actions/fetch-private-assets`
- `src/Client/App/corp-tower/addons/gut`
- `src/Client/App/corp-tower/Tests/CiSmokeTest.gd`
- `src/Client/App/corp-tower/Tests/Gut`
- `.github/godot/export_presets.android.ci.cfg`
- Google Play service account with Android Publisher API access and Play Console access to `com.galaxxigames.corptower`.

## Notes
- Current target platform is Android only.
- The smoke test includes the client-side equivalent of the server syntax/compile gate and catches startup wiring regressions before GUT runs.
- GUT tests should be added under `res://Tests/Gut`.
