package ru.trainingcalculator.app

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
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

    @Suppress("DEPRECATION")
    private fun versionCode() = context.packageManager.getPackageInfo(context.packageName, 0).versionCode

    @Test fun seedPreviousVersion() {
        assumeTrue(args.getString("forgeUpgrade") == "seed")
        assertEquals(23, versionCode())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitForApp(scenario)
            assertEquals("true", js(scenario, """
                (() => {
                    const diary = { ...state, profile: {...state.profile, name: ${JSONObject.quote(marker)}},
                        programs: [{id:'upgrade-program', name:'Upgrade program', days:[]}],
                        workouts: [{id:'upgrade-workout', date:'2026-01-01', name:'Upgrade workout', sets:[]}],
                        foods: [{id:'upgrade-food', date:'2026-01-01', name:'Upgrade food', grams:100, cal:100, protein:3, carbs:13, fat:4}],
                        n10Recipes: [{id:'upgrade-recipe', name:'Upgrade recipe', items:[]}]
                    };
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
        assertTrue(versionCode() > 23)
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitForApp(scenario)
            assertEquals("true", js(scenario, """
                (() => {
                    const previous = JSON.parse(localStorage.getItem('forge-ci-upgrade'));
                    const current = JSON.parse(localStorage.getItem('forge_v2'));
                    return !!previous && !!current && current.profile.name === ${JSONObject.quote(marker)} &&
                        ['profile','programs','workouts','foods','n10Recipes'].every(
                            key => JSON.stringify(current[key]) === JSON.stringify(previous[key]));
                })()
            """.trimIndent()))
            scenario.recreate()
            waitForApp(scenario)
            assertEquals(JSONObject.quote(marker), js(scenario, "state.profile.name"))
        }
    }
}
