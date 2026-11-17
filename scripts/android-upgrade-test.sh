#!/usr/bin/env bash
set -euo pipefail
mkdir -p test-results
trap 'adb logcat -d -t 2500 > test-results/emulator-logcat.txt; adb exec-out screencap -p > test-results/emulator-screen.png' EXIT
app=ru.trainingcalculator.app
runner="$app.test/androidx.test.runner.AndroidJUnitRunner"

instrument() {
  local name=$1
  shift
  adb shell am instrument -w -r "$@" "$runner" | tee "test-results/$name.txt"
  grep -Eq '^OK \([1-9][0-9]* tests?\)' "test-results/$name.txt"
}

baseline="$RUNNER_TEMP/forge-baseline.apk"
candidate=app/build/outputs/apk/debug/app-debug.apk
signer="$ANDROID_HOME/build-tools/35.0.0/apksigner"
"$signer" verify --print-certs "$baseline" | tee test-results/baseline-signer.txt
"$signer" verify --print-certs "$candidate" | tee test-results/candidate-signer.txt
diff <(grep 'Signer #1 certificate SHA-256 digest:' test-results/baseline-signer.txt) <(grep 'Signer #1 certificate SHA-256 digest:' test-results/candidate-signer.txt)
sha256sum "$baseline" "$candidate" > test-results/apk-SHA256SUMS
adb shell getprop ro.build.version.sdk | tee test-results/android-api.txt
adb install "$baseline"
adb install app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
instrument upgrade-seed -e forgeUpgrade seed -e forgeBaseCode "$BASE_VERSION_CODE" -e class "$app.UpgradePersistenceTest#seedPreviousVersion"
adb shell am force-stop "$app"
adb install -r "$candidate"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
for attempt in {1..20}; do
  adb shell dumpsys connectivity > test-results/emulator-connectivity.txt
  if grep -q '^Active default network: none' test-results/emulator-connectivity.txt; then break; fi
  sleep 1
done
grep -q '^Active default network: none' test-results/emulator-connectivity.txt
instrument upgrade-verify -e forgeUpgrade verify -e class "$app.UpgradePersistenceTest#verifyCandidateVersion"
adb shell am force-stop "$app"
instrument offline-relaunch -e forgeUpgrade verify -e class "$app.UpgradePersistenceTest#verifyCandidateVersion"
if [[ "$BASE_VERSION_CODE" != 24 ]]; then exit 0; fi
instrument offline-device -e notClass "$app.UpgradePersistenceTest"
instrument upgrade-cycles -e forgeUpgrade cycles -e class "$app.UpgradePersistenceTest#verifyCycleAfterUpgrade"

adb shell getprop qemu.hw.mainkeys
adb shell cmd overlay enable-exclusive --category --user current com.android.internal.systemui.navbar.gestural
for attempt in {1..20}; do
  if [[ "$(adb shell settings get secure navigation_mode | tr -d '\r')" == 2 ]]; then
    break
  fi
  sleep 1
done
if ! instrument gesture-back -e forgeBackInput gesture -e class "$app.NavigationBackTest#systemBackClosesCardThenReturnsThroughPages"; then
  adb shell dumpsys activity service com.android.systemui/.SystemUIService > test-results/gesture-systemui.txt
  exit 1
fi
