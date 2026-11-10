package ru.trainingcalculator.app

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.ExistingPeriodicWorkPolicy
import java.util.concurrent.TimeUnit
import java.util.UUID
import javax.net.ssl.HttpsURLConnection

internal object AnalyticsService {
    private const val JOB = "forge_posthog_upload"
    private const val MAX_QUEUE = 200
    private val allowed = setOf(
        "app_opened", "onboarding_completed", "program_created", "program_started", "exercise_added",
        "custom_exercise_created", "workout_started", "set_logged", "workout_completed", "food_searched",
        "food_added", "barcode_scanned", "backup_created", "backup_restored", "sync_completed"
    )
    val configured: Boolean get() = BuildConfig.FORGE_POSTHOG_KEY.isNotEmpty()
    private fun prefs(context: Context) = context.getSharedPreferences("forge_analytics", Context.MODE_PRIVATE)
    fun enabled(context: Context) = configured && prefs(context).getBoolean("consent", false)

    @Synchronized fun consent(context: Context, enabled: Boolean) {
        if (!configured) return
        val prefs = prefs(context)
        if (enabled) {
            if (!prefs.contains("install")) prefs.edit().putString("install", UUID.randomUUID().toString()).apply()
            prefs.edit().putBoolean("consent", true).apply()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(JOB + "_retry", ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<AnalyticsUpload>(15, TimeUnit.MINUTES)
                    .setConstraints(network()).build())
        } else {
            prefs.edit().clear().apply()
            WorkManager.getInstance(context).cancelUniqueWork(JOB)
            WorkManager.getInstance(context).cancelUniqueWork(JOB + "_retry")
        }
    }

    @Synchronized fun event(context: Context, event: String) {
        if (event !in allowed || !enabled(context)) return
        val prefs = prefs(context)
        val previous = queue(context)
        val rows = JSONArray()
        for (index in maxOf(0, previous.length() - MAX_QUEUE + 1) until previous.length()) rows.put(previous.get(index))
        rows.put(JSONObject().put("id", UUID.randomUUID().toString()).put("event", event).put("time", System.currentTimeMillis()))
        prefs.edit().putString("queue", rows.toString()).apply()
        WorkManager.getInstance(context).enqueueUniqueWork(JOB, ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<AnalyticsUpload>()
                .setConstraints(network()).build())
    }

    private fun network() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    private fun queue(context: Context) = runCatching { JSONArray(prefs(context).getString("queue", "[]")) }.getOrDefault(JSONArray())

    data class Pending(val install: String, val rows: List<JSONObject>)

    @Synchronized fun pending(context: Context): Pending? {
        if (!enabled(context)) return null
        val install = prefs(context).getString("install", null) ?: return null
        val queue = queue(context)
        return Pending(install, (0 until minOf(queue.length(), 50)).map(queue::getJSONObject))
    }

    @Synchronized fun acknowledge(context: Context, pending: Pending) {
        if (!enabled(context) || prefs(context).getString("install", null) != pending.install) return
        val sent = pending.rows.map { it.getString("id") }.toSet()
        val queue = queue(context)
        val remaining = JSONArray()
        for (index in 0 until queue.length()) {
            val row = queue.getJSONObject(index)
            if (row.getString("id") !in sent) remaining.put(row)
        }
        prefs(context).edit().putString("queue", remaining.toString()).apply()
    }
}

class AnalyticsUpload(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        if (!uploadLock.tryLock()) return Result.retry()
        return try { sendPending() } finally { uploadLock.unlock() }
    }

    private fun sendPending(): Result {
        repeat(4) {
            val batch = AnalyticsService.pending(applicationContext) ?: return Result.success()
            if (batch.rows.isEmpty() || isStopped) return Result.success()
            val payload = JSONArray()
            batch.rows.forEach { row ->
                val timestamp = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.ROOT).apply {
                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                }.format(java.util.Date(row.getLong("time")))
                payload.put(JSONObject().put("event", row.getString("event"))
                    .put("uuid", row.getString("id")).put("timestamp", timestamp)
                    .put("properties", JSONObject().put("distinct_id", batch.install).put("$" + "geoip_disable", true)
                        .put("$" + "process_person_profile", false)))
            }
            val status = runCatching {
                val endpoint = URL(BuildConfig.FORGE_POSTHOG_HOST + "/batch/")
                val connection = endpoint.openConnection() as HttpsURLConnection
                try {
                    connection.requestMethod = "POST"
                    connection.instanceFollowRedirects = false
                    connection.doOutput = true
                    connection.connectTimeout = 7_000
                    connection.readTimeout = 7_000
                    connection.setRequestProperty("Content-Type", "application/json")
                    if (isStopped || AnalyticsService.pending(applicationContext)?.install != batch.install) return Result.success()
                    val json = JSONObject().put("api_key", BuildConfig.FORGE_POSTHOG_KEY).put("batch", payload)
                    connection.outputStream.use { it.write(json.toString().toByteArray(Charsets.UTF_8)) }
                    connection.responseCode
                } finally { connection.disconnect() }
            }.getOrElse { return Result.retry() }
            when {
                status in 200..299 -> AnalyticsService.acknowledge(applicationContext, batch)
                status == 429 || status >= 500 -> return Result.retry()
                else -> return Result.failure()
            }
        }
        return if (AnalyticsService.pending(applicationContext)?.rows?.isNotEmpty() == true) Result.retry() else Result.success()
    }

    private companion object { val uploadLock = java.util.concurrent.locks.ReentrantLock() }
}
