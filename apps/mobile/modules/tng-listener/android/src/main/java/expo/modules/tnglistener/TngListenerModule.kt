package expo.modules.tnglistener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JavaScript-facing helpers for the TNG auto-collect setup screen (0.2, Phase 6):
 * is notification access granted, is Brokely exempt from battery optimisation, and the buttons
 * that open the matching Android settings pages.
 */
class TngListenerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not ready")

  override fun definition() = ModuleDefinition {
    Name("TngListener")

    // True when Brokely is in Android's "Notification access" list and switched on.
    Function("isNotificationAccessGranted") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    // True when battery optimisation will not stop Brokely in the background.
    Function("isIgnoringBatteryOptimizations") {
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("openNotificationAccessSettings") {
      val detail =
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
          Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
          ComponentName(context, TngNotificationListenerService::class.java).flattenToString()
        )
      // The detail page needs Android 11+; the list page works everywhere.
      start(detail) || start(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    Function("openBatterySettings") {
      val request =
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
          .setData(Uri.parse("package:${context.packageName}"))
      start(request) || start(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }
  }

  /** Starts a settings page from outside an activity; false if this phone has no such page. */
  private fun start(intent: Intent): Boolean =
    try {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (_: Exception) {
      false
    }
}
