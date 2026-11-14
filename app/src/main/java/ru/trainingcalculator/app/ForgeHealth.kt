package ru.trainingcalculator.app

import android.content.Context
import android.content.pm.PackageManager
import android.health.connect.AggregateRecordsRequest
import android.health.connect.HealthConnectException
import android.health.connect.HealthConnectManager
import android.health.connect.HealthPermissions
import android.health.connect.ReadRecordsRequestUsingFilters
import android.health.connect.TimeInstantRangeFilter
import android.health.connect.datatypes.ExerciseSessionRecord
import android.health.connect.datatypes.StepsRecord
import android.health.connect.datatypes.WeightRecord
import android.os.Build
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

internal object ForgeHealth {
    fun available(context: Context) = Build.VERSION.SDK_INT >= 34 && service(context) != null

    @RequiresApi(34)
    private fun service(context: Context) = context.getSystemService(HealthConnectManager::class.java)

    @RequiresApi(34)
    fun permissions() = arrayOf(HealthPermissions.READ_STEPS, HealthPermissions.READ_EXERCISE, HealthPermissions.READ_WEIGHT)

    @RequiresApi(34)
    private fun range(from: Instant, to: Instant) =
        TimeInstantRangeFilter.Builder().setStartTime(from).setEndTime(to).build()

    @RequiresApi(34)
    suspend fun read(context: Context): JSONObject {
        val client = requireNotNull(service(context))
        fun allowed(permission: String) = context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
        val now = Instant.now()
        val start = now.minus(Duration.ofDays(7))
        val week = range(start, now)
        val result = JSONObject().put("kind", "health").put("ok", true)
        if (allowed(HealthPermissions.READ_WEIGHT)) {
            val request = ReadRecordsRequestUsingFilters.Builder(WeightRecord::class.java)
                .setTimeRangeFilter(range(now.minus(Duration.ofDays(30)), now)).setAscending(false).setPageSize(1).build()
            val response = awaitHealth { client.readRecords(request, context.mainExecutor, it) }
            response.records.firstOrNull()?.let { record ->
                val localDate = record.time.atZone(record.zoneOffset).toLocalDate()
                result.put("weight", JSONObject().put("kg", record.weight.inGrams / 1000)
                    .put("date", localDate.toString()).put("id", record.metadata.id))
            }
        }
        if (allowed(HealthPermissions.READ_STEPS)) {
            val request = AggregateRecordsRequest.Builder<Long>(week).addAggregationType(StepsRecord.STEPS_COUNT_TOTAL).build()
            val response = awaitHealth { client.aggregate(request, context.mainExecutor, it) }
            response.get(StepsRecord.STEPS_COUNT_TOTAL)?.let { result.put("steps", it) }
        }
        if (allowed(HealthPermissions.READ_EXERCISE)) {
            val request = ReadRecordsRequestUsingFilters.Builder(ExerciseSessionRecord::class.java)
                .setTimeRangeFilter(week).setPageSize(1000).build()
            val response = awaitHealth { client.readRecords(request, context.mainExecutor, it) }
            val periods = response.records.map {
                maxOf(it.startTime, start) to minOf(it.endTime, now)
            }.filter { it.first < it.second }.sortedBy { it.first }
            var total = Duration.ZERO
            var count = 0
            var lastEnd = start
            for ((from, end) in periods) {
                if (from >= lastEnd) count++
                if (end > lastEnd) {
                    total = total.plus(Duration.between(maxOf(from, lastEnd), end))
                    lastEnd = end
                }
            }
            result.put("sessions", count).put("minutes", total.toMinutes()).put("truncated", response.nextPageToken != -1L)
        }
        return result
    }

    @RequiresApi(34)
    private suspend fun <T> awaitHealth(request: (OutcomeReceiver<T, HealthConnectException>) -> Unit): T =
        suspendCoroutine { continuation ->
            request(object : OutcomeReceiver<T, HealthConnectException> {
                override fun onResult(result: T) = continuation.resume(result)
                override fun onError(error: HealthConnectException) = continuation.resumeWithException(error)
            })
        }
}
