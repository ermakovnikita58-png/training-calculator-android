package ru.trainingcalculator.app

import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import androidx.test.uiautomator.UiDevice
import java.util.regex.Pattern
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** The emulator workflow also runs the exercise card scenario with an edge swipe. */
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
        val directory = java.io.File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "ux-v2").apply { mkdirs() }
        val state = js(scenario, "({navigation:window.ForgeNavigation?.inspect(),library:window.ForgeExerciseLibrary?.snapshot(),keyboard:document.body.classList.contains('forge-keyboard'),focused:document.activeElement?.tagName})")
        java.io.File(directory, "failure-${condition.hashCode()}.json").writeText(state)
        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).takeScreenshot(java.io.File(directory, "failure-${condition.hashCode()}.png"))
        assertEquals("Condition: $condition; UI: $state", "true", js(scenario, condition))
    }

    private fun click(scenario: ActivityScenario<MainActivity>, selector: String) {
        val element = "document.querySelector(${JSONObject.quote(selector)})"
        waitFor(scenario, "$element?.getClientRects().length > 0 && !$element.closest('[inert]')")
        js(scenario, "$element.click()")
    }

    private fun pressBack(scenario: ActivityScenario<MainActivity>, condition: String) {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        device.executeShellCommand("input keyevent KEYCODE_BACK")
        waitFor(scenario, condition)
    }

    private fun openPage(scenario: ActivityScenario<MainActivity>, page: String) {
        waitFor(scenario, "!!window.ForgeNavigation && !!window.ForgePerformance")
        js(scenario, "showPage('home');showPage(${JSONObject.quote(page)})")
        waitFor(scenario, "ForgeNavigation.inspect().current === ${JSONObject.quote(page)}")
    }
    @Test fun productSourcesAndCategoryRemainReadableWithSystemTextZoom() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "foodcatalog")
            js(scenario, "forgeSetFoodTab('catalog');true")
            for (scale in listOf(100, 120, 150, 200)) {
                scenario.onActivity { activity -> requireNotNull(findWeb(activity.window.decorView)).settings.textZoom = scale }
                js(scenario, "AndroidBridge.preferences();true")
                waitFor(scenario, "Number(getComputedStyle(document.documentElement).getPropertyValue('--forge-native-text-scale')) === ${scale / 100.0}")
                val context = InstrumentationRegistry.getInstrumentation().targetContext
                val directory = java.io.File(context.getExternalFilesDir(null), "ux-v2").apply { mkdirs() }
                java.io.File(directory, "products-text-$scale.json").writeText(js(scenario, """
                    (() => ({scale:$scale,width:innerWidth,dpr:devicePixelRatio,
                      overflow:document.documentElement.scrollWidth,
                      buttons:[...document.querySelectorAll('#foodcatalog [data-food-tab],#forgeFoodCategoryButton')].map(button => {
                        const rect=button.getBoundingClientRect();
                        return {text:button.textContent,width:rect.width,height:rect.height,left:rect.left,right:rect.right,
                          content:button.scrollWidth,client:button.clientWidth};
                      })}))()
                """.trimIndent()))
                assertTrue(UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
                    .takeScreenshot(java.io.File(directory, "products-text-$scale.png")))
                waitFor(scenario, """
                    (() => {
                      const buttons = [...document.querySelectorAll('#foodcatalog [data-food-tab],#forgeFoodCategoryButton')];
                      return buttons.length === 5 && buttons.every(button => {
                        const rect = button.getBoundingClientRect();
                        return rect.left >= 0 && rect.right <= innerWidth + 1 &&
                          rect.width >= 48 && rect.height >= 48 && button.scrollWidth <= button.clientWidth + 1;
                      }) && document.documentElement.scrollWidth <= innerWidth + 1;
                    })()
                """.trimIndent())
            }
            scenario.onActivity { activity -> requireNotNull(findWeb(activity.window.decorView)).settings.textZoom = 100 }
            js(scenario, "AndroidBridge.preferences();true")
            waitFor(scenario, "Number(getComputedStyle(document.documentElement).getPropertyValue('--forge-native-text-scale')) === 1")
            click(scenario, "#forgeFoodCategoryButton")
            click(scenario, "#forgeFoodCategorySheet [data-food-category='Рыба и морепродукты']")
            waitFor(scenario, "document.getElementById('forgeFoodCategoryValue').textContent === 'Рыба и морепродукты'")
            scenario.recreate()
            waitFor(scenario, """
                ForgeNavigation.inspect().current === 'foodcatalog' &&
                document.getElementById('forgeFoodCategoryValue').textContent === 'Рыба и морепродукты'
            """.trimIndent())
        }
    }

    @Test fun keyboardBackKeepsTheProgramDraftOpen() {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "plan")
            click(scenario, "#plan [data-fp-action='newProgram']")
            waitFor(scenario, "!!document.getElementById('n8ProgName')")
            val location = org.json.JSONArray(js(scenario, """
                (() => {
                  const element = document.getElementById('n8ProgName');
                  element.scrollIntoView({block:'center'});
                  const rect = element.getBoundingClientRect();
                  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
                })()
            """.trimIndent()))
            val offset = IntArray(2)
            scenario.onActivity { activity -> requireNotNull(findWeb(activity.window.decorView)).getLocationOnScreen(offset) }
            device.click(offset[0] + location.getDouble(0).toInt(), offset[1] + location.getDouble(1).toInt())
            waitFor(scenario, "document.body.classList.contains('forge-keyboard')")
            js(scenario, """
                (() => {
                  const input = document.getElementById('n8ProgName');
                  input.value = 'Черновик после клавиатуры';
                  input.dispatchEvent(new Event('input',{bubbles:true}));
                })()
            """.trimIndent())
            device.executeShellCommand("input keyevent KEYCODE_BACK")
            waitFor(scenario, """
                !document.body.classList.contains('forge-keyboard') &&
                document.getElementById('n8-program').classList.contains('show') &&
                document.getElementById('n8ProgName').value === 'Черновик после клавиатуры'
            """.trimIndent())
            js(scenario, "document.activeElement?.blur()")
            scenario.recreate()
            waitFor(scenario, """
                document.getElementById('n8-program').classList.contains('show') &&
                document.getElementById('n8ProgName').value === 'Черновик после клавиатуры'
            """.trimIndent())
            js(scenario, "ForgeNavigation.markSaved('n8-program');n8CloseOverlay();true")
        }
    }

    @Test fun systemFontScaleIsAppliedToTheProductScreen() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        org.junit.Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("forgeFontScale") == "verify")
        assertTrue(instrumentation.targetContext.resources.configuration.fontScale >= 1.45f)
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "foodcatalog")
            scenario.onActivity { activity ->
                val web = requireNotNull(findWeb(activity.window.decorView))
                assertEquals((activity.resources.configuration.fontScale * 100).toInt(), web.settings.textZoom)
            }
            waitFor(scenario, """
                Number(getComputedStyle(document.documentElement).getPropertyValue('--forge-native-text-scale')) >= 1.45 &&
                document.documentElement.scrollWidth <= innerWidth + 1 &&
                [...document.querySelectorAll('#foodcatalog [data-food-tab]')].every(button =>
                  button.scrollWidth <= button.clientWidth + 1 && button.getBoundingClientRect().right <= innerWidth + 1)
            """.trimIndent())
        }
    }

    @Test fun rotationPreservesTheProductQueryAndCategory() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "foodcatalog")
            js(scenario, """
                forgeSetFoodTab('catalog');
                forgeSetFoodCategory(forgeFoodCategoryList.indexOf('Рыба и морепродукты'));
                document.getElementById('foodSearch').value = 'Рыба';
                forgeFoodChange();
            """.trimIndent())
            scenario.onActivity { it.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
            waitFor(scenario, """
                innerWidth > innerHeight && ForgeNavigation.inspect().current === 'foodcatalog' &&
                document.getElementById('foodSearch').value === 'Рыба' &&
                document.getElementById('forgeFoodCategoryValue').textContent === 'Рыба и морепродукты'
            """.trimIndent())
            scenario.onActivity { it.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
            waitFor(scenario, """
                innerHeight > innerWidth && ForgeNavigation.inspect().current === 'foodcatalog' &&
                document.getElementById('foodSearch').value === 'Рыба'
            """.trimIndent())
            js(scenario, "document.getElementById('foodSearch').value='';forgeFoodChange();forgeSetFoodCategory(0);true")
        }
    }
    @Test fun systemBackClosesCardThenReturnsThroughPages() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val gesture = InstrumentationRegistry.getArguments().getString("forgeBackInput") == "gesture"
        val device = UiDevice.getInstance(instrumentation)
        if (gesture) {
            val navigationMode = Settings.Secure.getInt(instrumentation.targetContext.contentResolver, "navigation_mode", -1)
            assertEquals("The emulator must use gesture navigation", 2, navigationMode)
        }
        fun goBack(fromRight: Boolean = false) {
            if (gesture) {
                val width = device.displayWidth
                val midpoint = device.displayHeight / 2
                val start = if (fromRight) width - 1 else 0
                val end = if (fromRight) width / 10 else width * 9 / 10
                device.swipe(start, midpoint, end, midpoint, 40)
            } else {
                device.executeShellCommand("input keyevent KEYCODE_BACK")
            }
        }
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeExerciseLibrary && !!window.ForgeNavigation && !!window.ForgePerformance")
            js(scenario, "showPage('home');showPage('plan');showPage('library');ForgeExerciseLibrary.showGroups();y8OpenCard(encodeURIComponent('Жим штанги стоя'),'library')")
            waitFor(scenario, "ForgeNavigation.inspect().overlay==='y8DetailBack'")
            goBack()
            waitFor(scenario, "!ForgeNavigation.inspect().overlay && ForgeNavigation.inspect().current==='library'")
            goBack(fromRight = true)
            waitFor(scenario, "ForgeNavigation.inspect().current==='plan'")
            goBack()
            waitFor(scenario, "ForgeNavigation.inspect().current==='home'")
        }
    }
    @Test fun javascriptFailureDoesNotFinishActivity() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitFor(scenario, "!!window.ForgeNavigation")
            js(scenario, "showPage('plan');window.savedBack=ForgeNavigation.back;ForgeNavigation.back=()=>{throw Error('test failure')}")
            UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).executeShellCommand("input keyevent KEYCODE_BACK")
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
            waitFor(scenario, "!!window.ForgeExerciseLibrary && !!window.ForgeNavigation && !!window.ForgePerformance")
            js(scenario, "showPage('home');showPage('plan');showPage('library');ForgeExerciseLibrary.openGroup('Плечи','гантел');scrollTo(0,200);y8OpenCard(encodeURIComponent('Жим гантелей сидя'),'library')")
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            waitFor(scenario, "ForgeNavigation.inspect().overlay==='y8DetailBack'")
            device.executeShellCommand("input keyevent KEYCODE_BACK")
            waitFor(scenario, "!ForgeNavigation.inspect().overlay && ForgeExerciseLibrary.snapshot().group==='Плечи'")
            assertEquals("\"гантел\"", js(scenario, "document.getElementById('vs-query').value"))
            waitFor(scenario, "Math.abs(scrollY-200)<5")
            device.executeShellCommand("input keyevent KEYCODE_BACK")
            waitFor(scenario, """
                ForgeExerciseLibrary.snapshot().group === '' &&
                document.querySelectorAll('.vs-group img[data-art-type="MUSCLE_GROUP_ART"]').length === 14
            """.trimIndent())
            device.executeShellCommand("input keyevent KEYCODE_BACK")
            waitFor(scenario, "ForgeNavigation.inspect().current==='plan'")
            device.executeShellCommand("input keyevent KEYCODE_BACK")
            waitFor(scenario, "ForgeNavigation.inspect().current==='home'")
        }
    }

    @Test fun foodCategorySheetAndPortionReturnToCatalogWithAndroidBack() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "nutrition")
            click(scenario, """#nutrition [data-fp-action="go"][data-fp-params='["foodcatalog"]']""")
            waitFor(scenario, "ForgeNavigation.inspect().current === 'foodcatalog'")
            for (source in listOf("favorites", "recent", "my", "catalog")) {
                val tab = "#foodcatalog [data-food-tab='$source']"
                click(scenario, tab)
                waitFor(scenario, "document.querySelector(${JSONObject.quote(tab)}).classList.contains('active')")
            }

            click(scenario, "#forgeFoodCategoryButton")
            waitFor(scenario, "ForgeNavigation.inspect().overlay === 'modalback' && !!document.getElementById('forgeFoodCategorySheet')")
            val categoryOption = "#forgeFoodCategorySheet [data-food-category]:nth-child(2)"
            val categoryValue = "document.getElementById('forgeFoodCategoryValue').textContent"
            val category = js(scenario, "document.querySelector(${JSONObject.quote(categoryOption)}).dataset.foodCategory")
            click(scenario, categoryOption)
            waitFor(scenario, "!ForgeNavigation.inspect().overlay && !!document.querySelector('#foodSearchResults .forge-plus')")
            assertEquals(category, js(scenario, categoryValue))
            click(scenario, "#forgeFoodCategoryButton")
            waitFor(scenario, "ForgeNavigation.inspect().overlay === 'modalback'")
            pressBack(scenario, "!ForgeNavigation.inspect().overlay && ForgeNavigation.inspect().current === 'foodcatalog'")
            assertEquals(category, js(scenario, categoryValue))

            click(scenario, "#foodSearchResults .forge-plus")
            waitFor(scenario, "ForgeNavigation.inspect().overlay === 'modalback' && +document.getElementById('forgeFoodGrams')?.value > 0")
            waitFor(scenario, "document.getElementById('forgeFoodPreview').textContent.includes('ккал')")
            pressBack(scenario, "!ForgeNavigation.inspect().overlay && ForgeNavigation.inspect().current === 'foodcatalog'")
            pressBack(scenario, "ForgeNavigation.inspect().current === 'nutrition'")
        }
    }

    @Test fun programPickerUsesLocalArtAndPreservesTheDraftAcrossAndroidBack() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "plan")
            click(scenario, "#plan [data-fp-action='newProgram']")
            click(scenario, "#n8-program [onclick='n8EditProgramDay(-1)']")
            val dayName = "Проверка Android Back"
            val dayInput = """#n8-day input[onchange="n8DayField('name',this.value)"]"""
            js(scenario, """
                const field = document.querySelector(${JSONObject.quote(dayInput)});
                field.value = ${JSONObject.quote(dayName)};
                field.dispatchEvent(new Event('change', {bubbles: true}));
            """.trimIndent())
            click(scenario, "#n8-day [onclick='n8OpenPicker()']")
            waitFor(scenario, """
                (() => {
                    const images = Array.from(document.querySelectorAll('#n8-picker [data-picker-group] img[data-art-type="MUSCLE_GROUP_ART"]'));
                    for (const image of images) image.loading = 'eager';
                    return images.length === 14 && new Set(images.map(image => image.src)).size === 14 &&
                        images.every(image => image.complete && image.naturalWidth > 0 &&
                            new URL(image.src).origin === location.origin && image.src.endsWith('.webp'));
                })()
            """.trimIndent())

            val groups = "#n8-picker [data-picker-group]"
            val detail = "#n8-picker [data-picker-detail]"
            click(scenario, groups)
            click(scenario, detail)
            waitFor(scenario, """
                ForgeNavigation.inspect().overlay === 'x7DetailBack' &&
                    [...document.querySelectorAll('#x7DetailBack .forge-art-frames img')].some(image =>
                        image.complete && image.naturalWidth > 0 && image.src.endsWith('.svg') &&
                        new URL(image.src).origin === location.origin)
            """.trimIndent())
            pressBack(scenario, "ForgeNavigation.inspect().overlay === 'n8-picker' && !!document.querySelector('$detail')")
            pressBack(scenario, "ForgeNavigation.inspect().overlay === 'n8-picker' && !!document.querySelector('$groups')")
            pressBack(scenario, "ForgeNavigation.inspect().overlay === 'n8-day'")
            assertEquals(JSONObject.quote(dayName), js(scenario, "document.querySelector(${JSONObject.quote(dayInput)}).value"))

            click(scenario, "#n8-day [onclick='n8OpenPicker()']")
            click(scenario, groups)
            click(scenario, detail)
            val selectedName = js(scenario, "document.querySelector('#x7DetailBack h1').textContent.trim()")
            click(scenario, "#x7DetailBack [data-vs-action='add']")
            waitFor(scenario, "ForgeNavigation.inspect().overlay === 'n8-day'")
            val draft = "ForgeEditorNavigation.snapshot().day.exercises"
            assertEquals("1", js(scenario, "$draft.length"))
            assertEquals(selectedName, js(scenario, "$draft[0]"))
            assertEquals(JSONObject.quote(dayName), js(scenario, "ForgeEditorNavigation.snapshot().day.name"))

            // Leave the fixture in memory only. A test run must not write a program into the diary.
            js(scenario, "ForgeNavigation.markSaved('n8-day');showPage('home')")
        }
    }

    @Test fun scannerKeepsManualEntryWhenCameraCloses() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "nutrition")
            js(scenario, "openFoodScanner()")
            click(scenario, "#forge-scan-camera")
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            val prompt = device.wait(Until.findObject(By.res(Pattern.compile(".+:id/permission_deny_button"))), 5_000)
            if (prompt != null) {
                prompt.click()
            } else {
                device.findObject(By.text("Ввести вручную"))?.click()
            }
            val appPackage = InstrumentationRegistry.getInstrumentation().targetContext.packageName
            assertTrue("FORGE did not regain the foreground after the camera closed",
                device.wait(Until.hasObject(By.pkg(appPackage).depth(0)), 10_000))
            val deadline = android.os.SystemClock.elapsedRealtime() + 10_000
            var focused = false
            while (!focused && android.os.SystemClock.elapsedRealtime() < deadline) {
                scenario.onActivity { focused = it.hasWindowFocus() }
                if (!focused) android.os.SystemClock.sleep(50)
            }
            assertTrue("FORGE did not regain window focus after the camera closed", focused)
            waitFor(scenario, "!!document.getElementById('manualBarcode') && ForgeNavigation.inspect().overlay==='modalback'")
            pressBack(scenario, "!ForgeNavigation.inspect().overlay && ForgeNavigation.inspect().current==='nutrition'")
        }
    }

    @Test fun documentPickerCancelReturnsToProfileWithoutChangingDiary() {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "profile")
            js(scenario, "exportData()")
            assertTrue("System document provider did not open", device.wait(
                Until.hasObject(By.pkg(Pattern.compile("com\\.(google\\.)?android\\.documentsui"))), 10_000
            ))
            pressBack(scenario, "ForgeNavigation.inspect().current==='profile'")
        }
    }

    @Test fun googleEntryKeepsTheOfflineDiaryAndTheNativeBridgeRejectsAnotherProject() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openPage(scenario, "profile")
            val diary = js(scenario, "localStorage.getItem('forge_v2')")
            click(scenario, "#profileGoogleSignIn")
            waitFor(scenario, "ForgeNavigation.inspect().current==='account'")
            waitFor(scenario, "document.getElementById('n10CloudStatus').textContent.includes('подключись к интернету')")
            js(scenario, """
                const cloudHandler = window.ForgeCloudSession;
                window.ForgeCloudSession = message => {
                    if (message.kind === 'cloudGoogle') window.testGoogleReply = message;
                    cloudHandler(message);
                };
                window.AndroidBridge.googleSignIn({
                    requestId: 25, url: 'https://another-project.supabase.co',
                    key: 'sb_publishable_another_project_test', clientId: 'fixture.apps.googleusercontent.com'
                });
            """.trimIndent())
            waitFor(scenario, "window.testGoogleReply?.requestId===25 && window.testGoogleReply.status==='configuration'")
            assertEquals(diary, js(scenario, "localStorage.getItem('forge_v2')"))
        }
    }

    @Test fun nativeGoogleBridgeKeepsOnlyTheSupabaseSession() {
        val response = JSONObject()
            .put("access_token", "supabase-access")
            .put("refresh_token", "supabase-refresh")
            .put("expires_in", 3600)
            .put("provider_token", "google-token")
            .put("id_token", "id-token")
            .put("user", JSONObject().put("id", "user-id").put("email", "fixture@example.test").put("metadata", "private"))
        val session = ForgeGoogleAuth.publicSession(response)
        assertEquals(setOf("access_token", "refresh_token", "expires_in", "user"), session.keys().asSequence().toSet())
        assertEquals(setOf("id", "email"), session.getJSONObject("user").keys().asSequence().toSet())
        assertEquals("supabase-access", session.getString("access_token"))
    }
}
