package ru.trainingcalculator.app

import android.os.SystemClock
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TrainingCycleTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val device get() = UiDevice.getInstance(instrumentation)

    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) findWeb(view.getChildAt(index))?.let { return it }
        }
        return null
    }

    private fun js(scenario: ActivityScenario<MainActivity>, source: String): String {
        val done = CountDownLatch(1)
        var result = ""
        scenario.onActivity {
            requireNotNull(findWeb(it.window.decorView)).evaluateJavascript(source) { value ->
                result = value
                done.countDown()
            }
        }
        assertTrue("WebView JavaScript callback timed out", done.await(10, TimeUnit.SECONDS))
        return result
    }

    private fun waitFor(scenario: ActivityScenario<MainActivity>, condition: String) {
        val end = System.currentTimeMillis() + 12_000
        var result = ""
        while (System.currentTimeMillis() < end) {
            result = js(scenario, condition)
            if (result == "true") return
            Thread.sleep(100)
        }
        assertEquals(condition, "true", result)
    }

    private fun click(scenario: ActivityScenario<MainActivity>, selector: String) {
        val node = "document.querySelector(" + JSONObject.quote(selector) + ")"
        waitFor(scenario, "$node?.getClientRects().length > 0 && !$node.disabled")
        js(scenario, "$node.click()")
    }

    @Suppress("DEPRECATION")
    private fun versionCode() = context.packageManager.getPackageInfo(context.packageName, 0).versionCode

    private fun tap(scenario: ActivityScenario<MainActivity>, node: String) {
        val position = JSONObject(js(scenario, """
            (() => {
                const element = $node;
                element.scrollIntoView({block:'center'});
                const rect = element.getBoundingClientRect();
                return {x:(rect.left + rect.width / 2) * devicePixelRatio,
                        y:(rect.top + rect.height / 2) * devicePixelRatio};
            })()
        """.trimIndent()))
        scenario.onActivity {
            val webView = requireNotNull(findWeb(it.window.decorView))
            val screen = IntArray(2)
            webView.getLocationOnScreen(screen)
            position.put("x", position.getDouble("x") + screen[0] + webView.paddingLeft)
            position.put("y", position.getDouble("y") + screen[1] + webView.paddingTop)
        }
        assertTrue(device.click(position.getInt("x"), position.getInt("y")))
    }

    private fun pressBack() {
        device.executeShellCommand("input keyevent KEYCODE_BACK")
    }

    private fun openWizard(scenario: ActivityScenario<MainActivity>) {
        js(scenario, "showPage('plan');n8OpenProgram('upgrade-program')")
        tap(scenario, "document.querySelector('#n8-program [data-fc=open]')")
        waitFor(scenario, "document.querySelector('#forge-cycle').open")
        waitFor(scenario, "document.hasFocus()")
    }

    @Test fun seedVersion10() {
        assertEquals(11, versionCode())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.f6HandleAndroidBack && typeof state === 'object'")
            assertEquals("true", js(scenario, """
                (() => {
                    const bench = 'Жим штанги лёжа', row = 'Тяга с паузой';
                    const previous = { ...state,
                        programs: [{id:'upgrade-program',name:'Цикл на старте',days:[
                          {day:'ПН',name:'Верх',exercises:[bench,row],exerciseConfig:{[bench]:{weight:40,reps:10,sets:3},[row]:{weight:15,reps:12,sets:2}}},
                          {day:'ЧТ',name:'Вторая тренировка',exercises:[bench],exerciseConfig:{[bench]:{weight:30,reps:12,sets:3}}}
                        ]}],
                        customExercises:[row],
                        workouts:[{id:'upgrade-workout',date:today(),name:'Прежняя тренировка',sets:[{exercise:bench,weight:40,reps:5,done:true}]}],
                        foods:[{id:'upgrade-food',date:today(),name:'Гречка',grams:100,cal:130,protein:4,carbs:26,fat:1}],
                        n10Recipes:[{id:'upgrade-recipe',name:'Каша',servings:1,items:[]}]
                    };
                    const raw = JSON.stringify(previous);
                    localStorage.setItem('forge_v2', raw);
                    localStorage.setItem('forge-ci-cycles', raw);
                    return localStorage.getItem('forge_v2') === raw;
                })()
            """.trimIndent()))
        }
    }

    @Test fun verifyUpgradeAndOfflineCycle() {
        assertEquals(12, versionCode())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeCycles")
            assertEquals(1, Settings.Global.getInt(context.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0))
            val previous = "JSON.parse(localStorage.getItem('forge-ci-cycles'))"
            for (key in listOf("programs", "customExercises", "workouts", "foods", "n10Recipes")) {
                waitFor(scenario, "JSON.stringify(state.$key) === JSON.stringify($previous.$key)")
            }
            openWizard(scenario)
            click(scenario, "#forge-cycle [data-select='e0']")
            click(scenario, "#forge-cycle [data-fc='next']")
            waitFor(scenario, "document.querySelector('#fc-heading').textContent === 'Стартовые замеры'")
            pressBack()
            waitFor(scenario, "document.querySelector('#forge-cycle').open && document.querySelector('#fc-heading').textContent === 'Выбрать упражнения'")
            click(scenario, "#forge-cycle [data-fc='next']")
            click(scenario, "[data-fc='base-open']")
            click(scenario, "[data-fc='base-source'][data-source='known']")

            val weight = "document.querySelector('.fc-base-form [name=weight]')"
            tap(scenario, weight)
            waitForIme(scenario, true)
            waitFor(scenario, "document.activeElement === $weight && $weight.getBoundingClientRect().bottom <= (visualViewport.offsetTop + visualViewport.height + 1)")
            pressBack()
            waitForIme(scenario, false)
            waitFor(scenario, "!!$weight && document.querySelector('#forge-cycle').open")
            js(scenario, """
                document.querySelector('.fc-base-form [name=type]').value = 'fiveRM';
                $weight.value = '40';
                $weight.dispatchEvent(new Event('input', { bubbles:true }));
            """.trimIndent())
            click(scenario, "[data-fc='base-save']")
            click(scenario, "#forge-cycle [data-fc='next']")
            scenario.recreate()
            waitFor(scenario, "window.ForgeCycles && document.querySelector('#forge-cycle').open && state.trainingCycles[0].stage === 2")
            click(scenario, "[data-fc='activate']")
            click(scenario, "[data-fc='session-start']")
            waitFor(scenario, "state.active?.trainingCycle.rows[0].weight === 25")
            click(scenario, "#workout .n8-setgrid .n8-check")
            scenario.recreate()
            waitFor(scenario, "state.active?.exercises[0].sets[0].done && state.active?.cycleRestUntil > Date.now()")
            // Return from evaluateJavascript before the native confirm pauses the page.
            js(scenario, "setTimeout(() => document.querySelector('#workout [onclick=\"n8FinishWorkout()\"]').click(), 100); true")
            val finish = device.wait(Until.findObject(By.res("android:id/button1")), 5_000)
            assertTrue("Native WebView finish confirmation opens", finish != null)
            finish.click()
            waitFor(scenario, """
                document.querySelector('#fc-heading').textContent === 'План и факт' &&
                state.workouts[0].trainingCycle.rows[0].weight === 25 &&
                state.workouts[0].sets[0].weight === 25 &&
                state.active === null &&
                ['programs','customExercises','foods','n10Recipes'].every(key =>
                  JSON.stringify(state[key]) === JSON.stringify($previous[key])) &&
                JSON.stringify(state.workouts[1]) === JSON.stringify($previous.workouts[0])
            """.trimIndent())
        }
    }

    @Test fun verifyEdgeSwipe() {
        assertEquals(2, Settings.Secure.getInt(context.contentResolver, "navigation_mode", -1))
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeCycles")
            openWizard(scenario)
            val week = "document.querySelector('#forge-cycle [name=week]')"
            waitFor(scenario, "!!$week")
            tap(scenario, "document.querySelector('#fc-heading')")
            val condition = "document.querySelector('#forge-cycle').open && document.querySelector('#fc-heading').textContent === 'Стартовые замеры'"
            val width = device.displayWidth
            val midpoint = device.displayHeight / 2
            for (rightEdge in listOf(false, true)) {
                val start = if (rightEdge) width - 1 else 0
                val end = if (rightEdge) width / 10 else width * 9 / 10
                assertTrue(device.swipe(start, midpoint, end, midpoint, 40))
                val deadline = SystemClock.uptimeMillis() + 2_000
                do {
                    if (js(scenario, condition) == "true") return
                    Thread.sleep(100)
                } while (SystemClock.uptimeMillis() < deadline)
            }
            assertEquals(condition, "true", js(scenario, condition))
        }
    }

    private fun waitForIme(scenario: ActivityScenario<MainActivity>, expected: Boolean) {
        val end = System.currentTimeMillis() + 8_000
        var shown = !expected
        while (System.currentTimeMillis() < end) {
            scenario.onActivity {
                shown = ViewCompat.getRootWindowInsets(it.window.decorView)
                    ?.isVisible(WindowInsetsCompat.Type.ime()) == true
            }
            if (shown == expected) return
            Thread.sleep(100)
        }
        assertEquals("Android keyboard visibility", expected, shown)
    }
}
