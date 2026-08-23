package expo.modules.engramscreenshots

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import android.util.Size
import androidx.core.app.NotificationCompat

// Content-triggered job on MediaStore.Images: no process stays alive and no ongoing notification is needed.
// Content-trigger jobs fire once, so each run re-schedules itself while the setting is on.
class ScreenshotJob : JobService() {
  companion object {
    const val ACTION_DISMISS = "app.engram.screenshots.DISMISS"
    private const val PREFS = "engram-screenshots"
    private const val TAG = "engram-screenshots"
    private const val JOB_ID = 7002
    // New id: a channel's importance cannot be raised once it exists, and the old one was low.
    private const val CHANNEL = "screenshots-v2"
    private val FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun scheduler(c: Context) = c.getSystemService(JobScheduler::class.java)

    fun isEnabled(c: Context) = prefs(c).getBoolean("enabled", false)
    fun isScheduled(c: Context) = scheduler(c).getPendingJob(JOB_ID) != null

    fun setEnabled(c: Context, on: Boolean) {
      // Screenshots taken while the watch was off are not offered when it comes back on.
      prefs(c).edit().putBoolean("enabled", on).putLong("since", System.currentTimeMillis() / 1000).apply()
      if (on) schedule(c) else scheduler(c).cancel(JOB_ID)
    }

    fun schedule(c: Context) {
      val nm = c.getSystemService(NotificationManager::class.java)
      if (Build.VERSION.SDK_INT >= 26) {
        nm.deleteNotificationChannel("screenshots")
        nm.deleteNotificationChannel("screenshot-watch")
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Screenshots", NotificationManager.IMPORTANCE_HIGH).apply {
          setSound(null, null); enableVibration(false)
        })
      }
      val job = JobInfo.Builder(JOB_ID, ComponentName(c, ScreenshotJob::class.java))
        .addTriggerContentUri(JobInfo.TriggerContentUri(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, JobInfo.TriggerContentUri.FLAG_NOTIFY_FOR_DESCENDANTS))
        .setTriggerContentUpdateDelay(500).setTriggerContentMaxDelay(2000)
        .build()
      scheduler(c).schedule(job)
    }
  }

  override fun onStartJob(params: JobParameters): Boolean {
    try { if (params.triggeredContentUris != null || params.triggeredContentAuthorities != null) check() } catch (e: Exception) { Log.w(TAG, "query failed", e) }
    jobFinished(params, false)
    if (isEnabled(this)) schedule(this)
    return false
  }

  override fun onStopJob(params: JobParameters): Boolean = false

  // Newest image added in the last 15 s whose name or path says "screenshot". MediaStore hides pending rows,
  // so the insert event usually finds nothing and the final update finds the finished file.
  private fun check() {
    val since = maxOf(System.currentTimeMillis() / 1000 - 15, prefs(this).getLong("since", 0))
    val cols = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.DATA)
    val sel = MediaStore.Images.Media.DATE_ADDED + " > ?"
    val order = MediaStore.Images.Media.DATE_ADDED + " DESC"
    contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cols, sel, arrayOf(since.toString()), order)?.use { c ->
      if (!c.moveToFirst()) return
      val id = c.getLong(0)
      val where = ((c.getString(1) ?: "") + "/" + (c.getString(2) ?: "")).lowercase()
      if (!where.contains("screenshot") || where.contains(".pending") || prefs(this).getLong("lastId", -1) == id) return
      prefs(this).edit().putLong("lastId", id).apply()
      // engram in front shows its own in-app prompt; a notification on top of it would be a duplicate.
      val state = ActivityManager.RunningAppProcessInfo().also { ActivityManager.getMyMemoryState(it) }
      if (state.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) return
      notify(id, ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id))
    }
  }

  private fun notify(id: Long, uri: Uri) {
    val code = id.toInt()
    val share = Intent(Intent.ACTION_SEND).setClassName(packageName, "app.engram.ShareActivity").setType("image/*")
      .putExtra(Intent.EXTRA_STREAM, uri).putExtra("notificationId", code)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    val save = PendingIntent.getActivity(this, code, share, FLAGS)
    val dismiss = PendingIntent.getBroadcast(this, code, Intent(this, ScreenshotReceiver::class.java).setAction(ACTION_DISMISS).putExtra("id", code), FLAGS)
    // No setSilent(): it groups the notification as "silent" with summary-only alerting, which blocks the heads-up peek. The channel is already soundless.
    val b = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setContentTitle("Save screenshot to engram?").setContentText("Tap to keep it")
      .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
      .setContentIntent(save).setAutoCancel(true).setTimeoutAfter(60_000)
      .addAction(0, "Save", save).addAction(0, "Dismiss", dismiss)
    if (Build.VERSION.SDK_INT >= 29) {
      try { b.setLargeIcon(contentResolver.loadThumbnail(uri, Size(256, 256), null)) } catch (e: Exception) { Log.w(TAG, "no thumbnail", e) }
    }
    getSystemService(NotificationManager::class.java).notify(code, b.build())
  }
}

// Re-schedules the job after a reboot and handles the prompt's Dismiss action.
class ScreenshotReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED -> if (ScreenshotJob.isEnabled(context)) ScreenshotJob.schedule(context)
      ScreenshotJob.ACTION_DISMISS -> context.getSystemService(NotificationManager::class.java).cancel(intent.getIntExtra("id", 0))
    }
  }
}
