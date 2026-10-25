package expo.modules.tnglistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Raw TNG notifications kept on this phone only, for collecting format samples (Phase 6, D-128).
 *
 * Privacy (D-02, D-13, FR-IMP-11): the text can hold a person's full name, so it lives in this
 * app's private storage (not synced, not in Android backups since allowBackup is off, D-97), keeps
 * at most [MAX_ITEMS] notifications, and drops anything older than 30 days. The pending-import
 * queue replaces this in the next step.
 */
object TngCaptureStore {
  /** Touch 'n Go eWallet's Android package name. Confirm with: adb shell pm list packages tng */
  const val TNG_PACKAGE = "my.com.tngdigital.ewallet"

  const val MAX_ITEMS = 50
  private const val MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000
  private const val PREFS = "tng_captures"
  private const val KEY = "items"

  @Synchronized
  fun add(context: Context, item: JSONObject) {
    val items = load(context)
    // The same notification can be delivered twice; its key + post time repeat (FR-IMP-05).
    val duplicate =
      items.any {
        it.optString("key") == item.optString("key") &&
          it.optLong("postTime") == item.optLong("postTime")
      }
    if (duplicate) return
    items.add(0, item)
    save(context, items.take(MAX_ITEMS))
  }

  @Synchronized fun all(context: Context): List<JSONObject> = load(context)

  @Synchronized
  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }

  private fun load(context: Context): MutableList<JSONObject> {
    val raw =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        ?: return mutableListOf()
    val oldest = System.currentTimeMillis() - MAX_AGE_MS
    val array = try { JSONArray(raw) } catch (_: Exception) { return mutableListOf() }
    val items = mutableListOf<JSONObject>()
    for (i in 0 until array.length()) {
      val item = array.optJSONObject(i) ?: continue
      if (item.optLong("postTime") >= oldest) items.add(item)
    }
    return items
  }

  private fun save(context: Context, items: List<JSONObject>) {
    val array = JSONArray()
    items.forEach { array.put(it) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, array.toString()).apply()
  }
}
