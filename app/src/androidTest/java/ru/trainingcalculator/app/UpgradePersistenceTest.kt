package ru.trainingcalculator.app

import android.provider.Settings

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class UpgradePersistenceTest {
    private val args get() = InstrumentationRegistry.getArguments()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val marker = "CI upgrade fixture"
    private val device get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findWeb(view.getChildAt(index))?.let { return it }
        return null
    }

    private fun js(scenario: ActivityScenario<MainActivity>, code: String): String {
        val done = CountDownLatch(1)
        var result = ""
        scenario.onActivity { activity ->
            requireNotNull(findWeb(activity.window.decorView)).evaluateJavascript(code) { result = it; done.countDown() }
        }
        assertTrue(done.await(10, TimeUnit.SECONDS))
        return result
    }

    private fun waitForApp(scenario: ActivityScenario<MainActivity>) {
        repeat(100) {
            if (js(scenario, "!!window.ForgePerformance && typeof state === 'object'") == "true") return
            Thread.sleep(150)
        }
        error("FORGE did not initialize")
    }

    private fun waitFor(scenario: ActivityScenario<MainActivity>, condition: String) {
        repeat(60) {
            if (js(scenario, condition) == "true") return
            Thread.sleep(150)
        }
        assertEquals(condition, "true", js(scenario, condition))
    }

    private fun click(scenario: ActivityScenario<MainActivity>, selector: String) {
        val node = "document.querySelector(" + JSONObject.quote(selector) + ")"
        waitFor(scenario, "$node?.getClientRects().length > 0 && !$node.disabled && !$node.closest('[inert]')")
        js(scenario, "$node.click()")
    }

    @Suppress("DEPRECATION")
    private fun versionCode() = context.packageManager.getPackageInfo(context.packageName, 0).versionCode

    @Test fun seedPreviousVersion() {
        assumeTrue(args.getString("forgeUpgrade") == "seed")
        assertEquals(args.getString("forgeBaseCode")?.toInt(), versionCode())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitForApp(scenario)
            assertEquals("true", js(scenario, """
                (() => {
                    const diary = { ...state, profile: {...state.profile, name: ${JSONObject.quote(marker)}},
                        programs: [{id:'upgrade-program', name:'Upgrade program', days:[
                          {day:'ПН',name:'Замер',focus:'Сила',exercises:['Жим штанги лёжа'],
                           exerciseConfig:{'Жим штанги лёжа':{sets:3,reps:8,weight:35}}}
                        ]}],
                        workouts: [{id:'upgrade-workout', date:'2026-01-01', name:'Upgrade workout', duration:24,
                                    sets:[{exercise:'Жим штанги лёжа',weight:40,reps:8,done:true}]}],
                        foods: [{id:'upgrade-food', date:'2026-01-01', name:'Upgrade food', grams:100, cal:100, protein:3, carbs:13, fat:4}],
                        weights: [{date:'2026-01-01',weight:74,note:'Проверка обновления'}],
                        n10Recipes: [{id:'upgrade-recipe', name:'Upgrade recipe', items:[]}]
                    };
                    if (window.ForgeCycleModel) {
                      const cycle = ForgeCycleModel.createCycle(diary.programs[0],'2026-01-05','old-cycle');
                      const row = cycle.days[0].rows[0];
                      row.selected = true;
                      cycle.status = 'active';
                      cycle.stage = 2;
                      cycle.bases[row.group] = {type:'fiveRM',source:'known',date:'2026-01-04',value:40};
                      cycle.weeks[0].loads[row.id] = {percent:95};
                      const first = ForgeCycleModel.sessions(cycle)[0];
                      diary.trainingCycles = [cycle];
                      diary.workouts[0].trainingCycle = ForgeCycleModel.snapshot(cycle,first);
                    }
                    const snapshot = JSON.stringify(diary);
                    localStorage.setItem('forge_v2', snapshot);
                    localStorage.setItem('forge-ci-upgrade', snapshot);
                    return localStorage.getItem('forge_v2') === snapshot;
                })()
            """.trimIndent()))
        }
    }

    @Test fun verifyCandidateVersion() {
        assumeTrue(args.getString("forgeUpgrade") == "verify")
        assertEquals(25, versionCode())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitForApp(scenario)
            assertEquals("true", js(scenario, """
                (() => {
                    const previous = JSON.parse(localStorage.getItem('forge-ci-upgrade'));
                    const current = JSON.parse(localStorage.getItem('forge_v2'));
                    return !!previous && !!current && current.profile.name === ${JSONObject.quote(marker)} &&
                        ['profile','programs','workouts','foods','weights','n10Recipes','trainingCycles'].every(
                            key => JSON.stringify(current[key]) === JSON.stringify(previous[key]));
                })()
            """.trimIndent()))
            scenario.recreate()
            waitForApp(scenario)
            assertEquals(JSONObject.quote(marker), js(scenario, "state.profile.name"))
            if (js(scenario,"state.trainingCycles.length > 0") == "true") {
                assertEquals("37.5", js(scenario, "state.workouts[0].trainingCycle.rows[0].weight"))
                assertEquals("true", js(scenario, "ForgeCycleModel.validCycle(state.trainingCycles[0])"))
                js(scenario, "showPage('progress')")
                click(scenario, "#progress [data-fc=journal]")
                waitFor(scenario, "document.querySelector('#fc-heading').textContent==='План и факт'")
            }
        }
    }

    @Test fun verifyCycleAfterUpgrade() {
        assumeTrue(args.getString("forgeUpgrade") == "cycles")
        assertEquals(25, versionCode())
        assertEquals(1, Settings.Global.getInt(context.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0))
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeCycles")
            js(scenario, "showPage('plan')")
            click(scenario, "#plan [data-fc=template][data-index='0']")
            click(scenario, "#forge-cycle [data-fc=template-save]")
            click(scenario, "#n8-program [data-fc=open]")
            click(scenario, "#forge-cycle [name=program][value='upgrade-program']")
            click(scenario, "#forge-cycle [data-fc=create]")
            val hold = "document.querySelector('.fc-choice').parentElement"
            waitFor(scenario, "state.trainingCycles[0].programs.length === 2 && !!$hold")
            js(scenario, """
                [...document.querySelectorAll('#forge-cycle .fc-choice input[data-select]')].find(input =>
                  input.closest('label').textContent.includes('Статическое удержание на луч')).click()
            """.trimIndent())
            click(scenario, "#forge-cycle [data-fc=next]")
            click(scenario, "#forge-cycle [data-fc=base-open]")
            js(scenario, """
                for (const [name,value] of [['weight','20'],['seconds','20']]) {
                  const input = document.querySelector('.fc-base-form [name='+name+']');
                  input.value = value;
                  input.dispatchEvent(new Event('input',{bubbles:true}));
                }
            """.trimIndent())
            click(scenario, "#forge-cycle [data-fc=base-save]")
            click(scenario, "#forge-cycle [data-fc=next]")
            scenario.recreate()
            waitFor(scenario, "document.querySelector('#forge-cycle')?.open && state.trainingCycles[0].stage === 2")
            click(scenario, "#forge-cycle [data-fc=activate]")
            val session = js(scenario, """
                ForgeCycleModel.sessions(state.trainingCycles[0]).find(item =>
                  item.week===0 && item.day.name==='Луч').key
            """.trimIndent()).trim('"')
            click(scenario, "#forge-cycle .fc-card [data-fc=session-start][data-session='$session']")
            waitFor(scenario, "state.active?.trainingCycle?.dayName === 'Луч'")
            js(scenario, "n8ChooseExercise(state.active.exercises.findIndex(exercise=>exercise.unit==='seconds'))")
            waitFor(scenario, "document.querySelector('#workout input[aria-label=\"Секунды подхода 1\"]')?.value === '20'")
            js(scenario, """
                (() => {
                  const field = document.querySelector('#workout input[aria-label="Секунды подхода 1"]');
                  field.value = '23';
                  field.dispatchEvent(new Event('change', {bubbles:true}));
                })()
            """.trimIndent())
            click(scenario, "#workout .n8-setgrid [aria-label='Записать подход 1']")
            scenario.recreate()
            waitFor(scenario, "state.active?.exercises.some(exercise=>exercise.unit==='seconds' && exercise.sets[0].done && exercise.sets[0].seconds===23) && state.active.cycleRestUntil>Date.now()")
            js(scenario, "showPage('workout');setTimeout(()=>n8FinishWorkout(),100);true")
            val confirmation = device.wait(Until.findObject(By.res("android:id/button1")), 7_000)
            requireNotNull(confirmation) { "Finish workout confirmation did not open" }.click()
            waitFor(scenario, """
                state.active === null && document.querySelector('#forge-cycle').open &&
                state.workouts[0].trainingCycle.rows.some(row=>row.unit==='seconds' && row.seconds===20) &&
                state.workouts[0].sets.some(set=>set.unit==='seconds' && set.seconds===23) &&
                (() => {
                  const old = JSON.parse(localStorage.getItem('forge-ci-upgrade'));
                  return JSON.stringify(state.workouts[1]) === JSON.stringify(old.workouts[0]) &&
                    ['foods','weights','n10Recipes'].every(key=>JSON.stringify(state[key])===JSON.stringify(old[key])) &&
                    JSON.stringify(state.programs.find(program=>program.id==='upgrade-program'))===JSON.stringify(old.programs[0]);
                })()
            """.trimIndent())
        }
    }
}
