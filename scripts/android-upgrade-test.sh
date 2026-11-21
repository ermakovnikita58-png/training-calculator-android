#!/usr/bin/env bash
set -euo pipefail
mkdir -p test-results
adb logcat -v threadtime > test-results/emulator-live-logcat.txt 2>&1 &
logcat_pid=$!
vmstat 5 > test-results/runner-memory.txt &
memory_pid=$!
cleanup() {
  local status=$?
  set +e
  kill "$logcat_pid" "$memory_pid" 2>/dev/null
  timeout 10 adb shell settings put system font_scale 1.0
  timeout 15 adb logcat -d -t 2500 > test-results/emulator-logcat.txt
  timeout 15 adb exec-out screencap -p > test-results/emulator-screen.png
  timeout 20 adb pull /sdcard/Android/data/ru.trainingcalculator.app/files/ux-v2 test-results/android-ux-v2
  ps -eo pid,ppid,%cpu,%mem,rss,args > test-results/runner-processes.txt
  df -h > test-results/runner-disk.txt
  sudo dmesg -T | tail -80 > test-results/runner-kernel.txt
  exit "$status"
}
trap cleanup EXIT
app=ru.trainingcalculator.app
runner="$app.test/androidx.test.runner.AndroidJUnitRunner"
# Let the Google APIs image finish its first launcher initialization before
# taking it offline. This is emulator setup, not an app permission change.
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.HOME
sleep 15

instrument() {
  local name=$1
  shift
  printf 'Instrumentation stage %s at %s\n' "$name" "$(date -Iseconds)"
  timeout 360 adb shell am instrument -w -r "$@" "$runner" | tee "test-results/$name.txt"
  grep -Eq '^OK \([1-9][0-9]* tests?\)' "test-results/$name.txt"
}

baseline="$RUNNER_TEMP/forge-baseline.apk"
candidate="$RUNNER_TEMP/forge-candidate.apk"
signer="$ANDROID_HOME/build-tools/35.0.0/apksigner"
"$signer" verify --print-certs "$baseline" | tee test-results/baseline-signer.txt
"$signer" verify --print-certs "$candidate" | tee test-results/candidate-signer.txt
diff <(grep 'Signer #1 certificate SHA-256 digest:' test-results/baseline-signer.txt) <(grep 'Signer #1 certificate SHA-256 digest:' test-results/candidate-signer.txt)
sha256sum "$baseline" "$candidate" > test-results/apk-SHA256SUMS
adb shell getprop ro.build.version.sdk | tee test-results/android-api.txt
timeout 120 adb install --no-incremental "$baseline"
timeout 120 adb install --no-incremental "$RUNNER_TEMP/forge-instrumentation.apk"
instrument upgrade-seed -e forgeUpgrade seed -e forgeBaseCode "$BASE_VERSION_CODE" -e class "$app.UpgradePersistenceTest#seedPreviousVersion"
adb shell am force-stop "$app"
timeout 120 adb install --no-incremental -r "$candidate"
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
if [[ "$BASE_VERSION_CODE" == 26 || "$BASE_VERSION_CODE" == 27 ]]; then exit 0; fi
adb shell settings put secure show_ime_with_hard_keyboard 1
instrument offline-device -e notClass "$app.UpgradePersistenceTest"
adb pull "/sdcard/Android/data/$app/files/ux-v2" test-results/android-ux-v2
adb shell settings put system font_scale 1.5
adb shell am force-stop "$app"
instrument system-text-scale -e forgeFontScale verify -e class "$app.NavigationBackTest#systemFontScaleIsAppliedToTheProductScreen"
adb shell settings put system font_scale 1.0
adb shell am force-stop "$app"
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
