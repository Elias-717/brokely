package expo.modules.tnglistener

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives every notification once the student grants "Notification access".
 *
 * Step 1 (this branch): intentionally does nothing with the content. Reading, filtering to TNG
 * and the pending-import queue come in the next steps (D-02, FR-IMP-05, FR-IMP-11). Keeping it
 * empty means no notification text, which can hold names, is read or stored yet.
 */
class TngNotificationListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    // Next step: ignore everything except TNG's package, then hand the text to the parser.
  }
}
