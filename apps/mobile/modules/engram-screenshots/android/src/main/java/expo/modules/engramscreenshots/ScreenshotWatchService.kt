package expo.modules.engramscreenshots

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.util.Size
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

// Watches MediaStore for new screenshots while the setting is on and offers each one to the share overlay
// through a notification. Foreground type "specialUse": dataSync is capped at 6 h per day on Android 15
// and cannot be started from BOOT_COMPLETED there.
class ScreenshotWatchService : Service() {
  companion object {
    @Volatile var running = false
    const val ACTION_STOP = "app.engram.screenshots.STOP"
    const val ACTION_DISMISS = "app.engram.screenshots.DISMISS"
    private const val PREFS = "engram-screenshots"
    private const val TAG = "engram-screenshots"
    private const val ONGOING_ID = 7001
    private const val CHANNEL_PROMPT = "screenshots"
    private const val CHANNEL_WATCH = "screenshot-watch"
    private val FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

    fun isEnabled(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false)

    fun setEnabled(c: Context, on: Boolean) {
      c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", on).apply()
      if (on) start(c) else c.stopService(Intent(c, ScreenshotWatchService::class.java))
    }

    fun start(c: Context) {
      val i = Intent(c, ScreenshotWatchService::class.java)
      if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
    }
  }

  private val seen = HashSet<Long>()
  private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
    override fun onChange(selfChange: Boolean, uri: Uri?) {
      try { check() } catch (e: Exception) { Log.w(TAG, "query failed", e) }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_WATCH, "Screenshot watcher", NotificationManager.IMPORTANCE_MIN))
      nm.createNotificationChannel(NotificationChannel(CHANNEL_PROMPT, "Screenshots", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
    }
    val stop = PendingIntent.getService(this, 0, Intent(this, javaClass).setAction(ACTION_STOP), FLAGS)
    val ongoing = NotificationCompat.Builder(this, CHANNEL_WATCH)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setContentTitle("engram is watching for screenshots")
      .setOngoing(true).setSilent(true).setPriority(NotificationCompat.PRIORITY_MIN)
      .addAction(0, "Stop", stop)
      .build()
    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    ServiceCompat.startForeground(this, ONGOING_ID, ongoing, type)
    contentResolver.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, observer)
    running = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> { setEnabled(this, false); return START_NOT_STICKY }
      ACTION_DISMISS -> getSystemService(NotificationManager::class.java).cancel(intent.getIntExtra("id", 0))
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    contentResolver.unregisterContentObserver(observer)
    super.onDestroy()
  }

  // Newest image added in the last 10 s whose name or path says "screenshot". MediaStore hides pending rows,
  // so the insert event usually finds nothing and the final update finds the finished file.
  private fun check() {
    val since = System.currentTimeMillis() / 1000 - 10
    val cols = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.DATA)
    val sel = MediaStore.Images.Media.DATE_ADDED + " > ?"
    val order = MediaStore.Images.Media.DATE_ADDED + " DESC"
    contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cols, sel, arrayOf(since.toString()), order)?.use { c ->
      if (!c.moveToFirst()) return
      val id = c.getLong(0)
      val where = ((c.getString(1) ?: "") + "/" + (c.getString(2) ?: "")).lowercase()
      if (!where.contains("screenshot") || where.contains(".pending") || !seen.add(id)) return
      notify(id, ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id))
    }
  }

  private fun notify(id: Long, uri: Uri) {
    val share = Intent(Intent.ACTION_SEND).setClassName(packageName, "app.engram.ShareActivity").setType("image/*")
      .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    val code = id.toInt()
    val save = PendingIntent.getActivity(this, code, share, FLAGS)
    val dismiss = PendingIntent.getService(this, code, Intent(this, javaClass).setAction(ACTION_DISMISS).putExtra("id", code), FLAGS)
    val b = NotificationCompat.Builder(this, CHANNEL_PROMPT)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setContentTitle("Save screenshot to engram?").setContentText("Tap to keep it")
      .setContentIntent(save).setAutoCancel(true).setSilent(true)
      .addAction(0, "Save", save).addAction(0, "Dismiss", dismiss)
    if (Build.VERSION.SDK_INT >= 29) {
      try { b.setLargeIcon(contentResolver.loadThumbnail(uri, Size(256, 256), null)) } catch (e: Exception) { Log.w(TAG, "no thumbnail", e) }
    }
    getSystemService(NotificationManager::class.java).notify(code, b.build())
  }
}
