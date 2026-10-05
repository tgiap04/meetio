package expo.modules.recentsprivacy

import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Keeps meeting content out of the app switcher while the biometric lock is on.
 * Android 13+: `setRecentsScreenshotEnabled(false)` blanks only the recents thumbnail — screenshots
 * and screen mirroring (e.g. projecting the phone during a demo) keep working.
 * Older versions have no such switch, so FLAG_SECURE is the fallback; it also blocks screenshots.
 */
class RecentsPrivacyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecentsPrivacy")

    AsyncFunction("setHidden") { hidden: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        activity.setRecentsScreenshotEnabled(!hidden)
      } else if (hidden) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      } else {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
      }
      true
    }.runOnQueue(Queues.MAIN)
  }
}
