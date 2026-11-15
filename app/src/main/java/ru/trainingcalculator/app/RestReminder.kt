package ru.trainingcalculator.app

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

internal object RestReminder {
    private const val CHANNEL = "forge_rest"
    private const val DEADLINE = "deadline"
    private const val NOTIFICATION = 21
    @Volatile var activityVisible = false

    private fun prefs(context: Context) = context.getSharedPreferences("forge_rest", Context.MODE_PRIVATE)
    fun enabled(context: Context) = prefs(context).getBoolean("enabled", false)
    fun toggle(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean("enabled", enabled).apply()
        if (!enabled) sync(context, 0)
    }

    private fun pending(context: Context, deadline: Long): PendingIntent = PendingIntent.getBroadcast(
        context, NOTIFICATION,
        Intent(context, RestReminderReceiver::class.java).putExtra(DEADLINE, deadline),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    fun sync(context: Context, deadline: Long) {
        val alarm = context.getSystemService(AlarmManager::class.java)
        val now = System.currentTimeMillis()
        if (!enabled(context) || deadline <= now || deadline - now > 2 * 60 * 60 * 1000) {
            if (prefs(context).contains(DEADLINE)) {
                alarm.cancel(pending(context, 0))
                prefs(context).edit().remove(DEADLINE).apply()
            }
            return
        }
        if (prefs(context).getLong(DEADLINE, 0) == deadline) return
        prefs(context).edit().putLong(DEADLINE, deadline).apply()
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, deadline, pending(context, deadline))
    }

    @SuppressLint("MissingPermission")
    fun deliver(context: Context, intent: Intent) {
        val deadline = intent.getLongExtra(DEADLINE, 0)
        val prefs = prefs(context)
        if (deadline <= 0 || prefs.getLong(DEADLINE, 0) != deadline || System.currentTimeMillis() < deadline) return
        prefs.edit().remove(DEADLINE).apply()
        val notifications = NotificationManagerCompat.from(context)
        if (activityVisible || !enabled(context) || !notifications.areNotificationsEnabled() ||
            System.currentTimeMillis() - deadline > 10 * 60 * 1000) return
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL, "Таймер отдыха", NotificationManager.IMPORTANCE_DEFAULT)
            channel.enableVibration(true)
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        val launch = PendingIntent.getActivity(context, NOTIFICATION,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("FORGE Training")
            .setContentText("Отдых завершён")
            .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
            .setContentIntent(launch).setAutoCancel(true).build()
        runCatching { notifications.notify(NOTIFICATION, notification) }
    }
}

class RestReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = RestReminder.deliver(context, intent)
}
