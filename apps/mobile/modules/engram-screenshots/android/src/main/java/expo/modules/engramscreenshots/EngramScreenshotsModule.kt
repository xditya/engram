package expo.modules.engramscreenshots

import android.Manifest
import android.os.Build
import expo.modules.interfaces.permissions.Permissions.askForPermissionsWithPermissionsManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EngramScreenshotsModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("EngramScreenshots")

    Function("isRunning") { ScreenshotWatchService.running }

    Function("start") { ScreenshotWatchService.setEnabled(context, true) }

    Function("stop") { ScreenshotWatchService.setEnabled(context, false) }

    AsyncFunction("requestPermissions") { promise: Promise ->
      val perms = if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.POST_NOTIFICATIONS)
        else arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
      askForPermissionsWithPermissionsManager(appContext.permissions, promise, *perms)
    }
  }
}
