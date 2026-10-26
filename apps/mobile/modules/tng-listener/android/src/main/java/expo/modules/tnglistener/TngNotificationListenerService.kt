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
 * formats (QR payment, top-up, refund, hidden extras). Nothing is parsed, imported or counted yet
 * (the parser is `parseTngNotification` in `@brokely/domain`). Blank notifications and TNG's
 * group summaries are dropped. Promotions are still kept: they show what must be ignored.
 * Every other app's notifications are ignored without being read.
 */
class TngNotificationListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.packageName != TngCaptureStore.TNG_PACKAGE) return
    // TNG also posts a blank "group summary" next to each notification. It carries no payment.
    if ((sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
    val extras = sbn.notification.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
    if (title.isBlank() && text.isBlank() && bigText.isBlank()) return
    val item =
      JSONObject()
        .put("key", sbn.key)
        .put("postTime", sbn.postTime)
        .put("title", title)
        .put("text", text)
        .put("bigText", bigText)
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
