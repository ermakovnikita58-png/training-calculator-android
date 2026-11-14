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

adb install "$RUNNER_TEMP/forge-previous/app/build/outputs/apk/debug/app-debug.apk"
adb install app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
instrument upgrade-seed -e forgeUpgrade seed -e class "$app.UpgradePersistenceTest#seedPreviousVersion"
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell svc wifi disable
adb shell svc data disable
instrument upgrade-verify -e forgeUpgrade verify -e class "$app.UpgradePersistenceTest#verifyCandidateVersion"
instrument offline-device -e notClass "$app.UpgradePersistenceTest"

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
