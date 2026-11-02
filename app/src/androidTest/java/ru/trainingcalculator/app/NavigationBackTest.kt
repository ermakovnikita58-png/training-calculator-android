package ru.trainingcalculator.app

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Run on a test emulator. These are system-button tests, not edge-gesture proof. */
@RunWith(AndroidJUnit4::class)
class NavigationBackTest {
    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) findWeb(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun js(scenario: ActivityScenario<MainActivity>, code: String): String {
        val done = CountDownLatch(1)
        var result = ""
        scenario.onActivity { activity ->
            findWeb(activity.window.decorView)!!.evaluateJavascript(code) { result = it; done.countDown() }
        }
        assertTrue("JavaScript callback timeout", done.await(10, TimeUnit.SECONDS))
        return result
    }
    private fun waitFor(scenario: ActivityScenario<MainActivity>, condition: String) {
        val end = System.currentTimeMillis() + 10000
        while (System.currentTimeMillis() < end) {
            if (js(scenario, condition) == "true") return
            Thread.sleep(100)
        }
        assertEquals("Condition: $condition", "true", js(scenario, condition))
    }
    @Test fun systemBackClosesCardThenReturnsThroughPages() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeExerciseLibrary")
            js(scenario, "showPage('home');showPage('plan');showPage('library');ForgeExerciseLibrary.showGroups();y8OpenCard(encodeURIComponent('Жим штанги стоя'),'library')")
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            waitFor(scenario, "ForgeNavigation.inspect().overlay==='y8DetailBack'")
            device.pressBack()
            waitFor(scenario, "!ForgeNavigation.inspect().overlay && ForgeNavigation.inspect().current==='library'")
            device.pressBack()
            waitFor(scenario, "ForgeNavigation.inspect().current==='plan'")
            device.pressBack()
            waitFor(scenario, "ForgeNavigation.inspect().current==='home'")
        }
    }
    @Test fun javascriptFailureDoesNotFinishActivity() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeNavigation")
            js(scenario, "showPage('plan');window.savedBack=ForgeNavigation.back;ForgeNavigation.back=()=>{throw Error('test failure')}")
            UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()
            Thread.sleep(300)
            assertEquals("\"plan\"", js(scenario, "ForgeNavigation.inspect().current"))
            js(scenario, "ForgeNavigation.back=window.savedBack")
        }
    }
    @Test fun recreationRestoresPageAndScroll() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeNavigation")
            js(scenario, "showPage('home');showPage('library');scrollTo(0,300);ForgeNavigation.persist()")
            scenario.recreate()
            waitFor(scenario, "!!window.ForgeNavigation && ForgeNavigation.inspect().current==='library'")
            waitFor(scenario, "Math.abs(scrollY-300)<5")
        }
    }
    @Test fun libraryBackRetainsFiltersThenReturnsThroughGroups() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeExerciseLibrary")
            js(scenario, "showPage('home');showPage('plan');showPage('library');ForgeExerciseLibrary.openGroup('Плечи','гантел');scrollTo(0,200);y8OpenCard(encodeURIComponent('Жим гантелей сидя'),'library')")
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            waitFor(scenario, "ForgeNavigation.inspect().overlay==='y8DetailBack'")
            device.pressBack()
            waitFor(scenario, "!ForgeNavigation.inspect().overlay && ForgeExerciseLibrary.snapshot().group==='Плечи'")
            assertEquals("\"гантел\"", js(scenario, "document.getElementById('vs-query').value"))
            waitFor(scenario, "Math.abs(scrollY-200)<5")
            device.pressBack()
            waitFor(scenario, "ForgeExerciseLibrary.snapshot().group==='' && document.querySelectorAll('.vs-group').length===14")
            device.pressBack()
            waitFor(scenario, "ForgeNavigation.inspect().current==='plan'")
            device.pressBack()
            waitFor(scenario, "ForgeNavigation.inspect().current==='home'")
        }
    }
}
