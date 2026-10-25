package expo.modules.tnglistener

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/**
 * Receives every notification once the student grants "Notification access", and keeps only
 * Touch 'n Go's (D-02, D-13).
 *
 * Step 2 (capture only): the raw text goes to [TngCaptureStore] so the author can see the real
 * formats (QR payment, top-up, refund, hidden extras). Nothing is parsed, imported or counted yet.
 * Every other app's notifications are ignored without being read.
 */
class TngNotificationListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.packageName != TngCaptureStore.TNG_PACKAGE) return
    val extras = sbn.notification.extras ?: return
    val item =
      JSONObject()
        .put("key", sbn.key)
        .put("postTime", sbn.postTime)
        .put("title", extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: "")
        .put("text", extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: "")
        .put("bigText", extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: "")
        .put("extras", describe(extras))
    TngCaptureStore.add(applicationContext, item)
  }

  /**
   * Every extra's name with its value when it is plain text, a number or a yes/no; other kinds
   * (pictures, intents) are listed by type only. This shows whether TNG puts a transaction ID in
   * a hidden field (the visible text has none, F-02).
   */
  @Suppress("DEPRECATION")
  private fun describe(extras: Bundle): JSONObject {
    val out = JSONObject()
    for (name in extras.keySet()) {
      val value = extras.get(name)
      out.put(
        name,
        when (value) {
          null -> "null"
          is CharSequence, is Number, is Boolean -> value.toString()
          else -> "<${value.javaClass.simpleName}>"
        }
      )
    }
    return out
  }
}
