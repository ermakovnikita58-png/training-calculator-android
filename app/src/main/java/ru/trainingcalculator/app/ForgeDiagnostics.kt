package ru.trainingcalculator.app

import android.content.Context
import android.os.SystemClock
import com.google.firebase.FirebaseApp
import com.google.firebase.crashlytics.FirebaseCrashlytics

internal class ForgeDiagnostics(private val context: Context) {
    private val prefs = context.getSharedPreferences("forge_diagnostics", Context.MODE_PRIVATE)
    private var lastReport = -60_000L

    fun configured() = BuildConfig.FORGE_CRASH_CONFIGURED && FirebaseApp.getApps(context).isNotEmpty()
    fun enabled() = configured() && prefs.getBoolean("consent", false)
    private fun sdk() = if (configured()) runCatching { FirebaseCrashlytics.getInstance() }.getOrNull() else null

    fun consent(enabled: Boolean) {
        val crashlytics = sdk() ?: return
        prefs.edit().putBoolean("consent", enabled).apply()
        if (enabled) {
            crashlytics.deleteUnsentReports()
            crashlytics.setCrashlyticsCollectionEnabled(true)
        } else {
            crashlytics.setCrashlyticsCollectionEnabled(false)
            crashlytics.deleteUnsentReports()
        }
    }

    fun record(category: String) {
        val test = BuildConfig.DEBUG && category == "test_non_fatal"
        if (!enabled() || !test && category !in setOf("web_error", "web_rejection", "web_renderer_exit")) return
        val now = SystemClock.elapsedRealtime()
        if (!test && now - lastReport < 60_000) return
        lastReport = now
        sdk()?.recordException(IllegalStateException("FORGE diagnostic: $category"))
    }
}
