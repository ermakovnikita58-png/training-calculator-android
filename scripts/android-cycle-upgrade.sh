#!/usr/bin/env bash
set -euo pipefail
mkdir -p test-results
trap 'adb logcat -d -t 2500 > test-results/emulator-logcat.txt; adb exec-out screencap -p > test-results/emulator-screen.png' EXIT
app=ru.trainingcalculator.app
runner="$app.test/androidx.test.runner.AndroidJUnitRunner"
test_class="$app.TrainingCycleTest"

instrument() {
  local report=$1
  shift
  adb shell am instrument -w -r "$@" "$runner" | tee "test-results/$report.txt"
  grep -Eq '^OK \([1-9][0-9]* tests?\)' "test-results/$report.txt"
}

adb install "$RUNNER_TEMP/forge-base-10/app/build/outputs/apk/debug/app-debug.apk"
adb install app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
instrument baseline -e class "$test_class#seedVersion10"
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
adb shell dumpsys connectivity > test-results/emulator-connectivity.txt
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell cmd overlay enable-exclusive --category --user current com.android.internal.systemui.navbar.gestural
for attempt in {1..20}; do
  if [[ "$(adb shell settings get secure navigation_mode | tr -d '\r')" == 2 ]]; then break; fi
  sleep 1
done
adb shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME > test-results/emulator-launcher.txt
if ! instrument upgrade-and-offline -e forgeGesture true -e class "$test_class#verifyUpgradeAndOfflineCycle"; then
  adb shell dumpsys activity service com.android.systemui/.SystemUIService > test-results/emulator-systemui.txt
  exit 1
fi
