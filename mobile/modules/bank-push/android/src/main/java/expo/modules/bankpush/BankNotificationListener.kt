package expo.modules.bankpush

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import org.json.JSONObject
import java.io.File

/**
 * Читає сповіщення банківських застосунків (моно, Укрсиб, ПУМБ…) і кладе їх у чергу.
 * Розбір і вся логіка — в JS (src/lib/pushes.ts); тут лише фільтр «схоже на гроші»
 * і миттєвий запуск фонової задачі, щоб реакція була за секунди, а не за 15 хв.
 */
class BankNotificationListener : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName == packageName || sbn.isOngoing) return
    val n = sbn.notification
    if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

    val extras = n.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
      ?.toString().orEmpty()
    if (!MONEY.containsMatchIn("$title $text")) return

    val event = JSONObject()
      .put("pkg", sbn.packageName)
      .put("title", title)
      .put("text", text)
      .put("at", sbn.postTime)
      .put("key", sbn.key)
    append(this, event.toString())
    wakeJs(this)
  }

  companion object {
    // Сума з валютою: «−340 ₴», «1 250,00 грн», «99.90 UAH»
    private val MONEY = Regex("""\d[\d\s ]*([.,]\d{1,2})?\s*(₴|грн|UAH)""", RegexOption.IGNORE_CASE)
    private const val QUEUE = "bank_pushes.jsonl"
    private val lock = Any()

    fun queueFile(context: Context) = File(context.filesDir, QUEUE)

    fun append(context: Context, line: String) = synchronized(lock) {
      queueFile(context).appendText(line + "\n")
    }

    /** Забрати всі події з черги (і очистити її) */
    fun drain(context: Context): String = synchronized(lock) {
      val f = queueFile(context)
      if (!f.exists()) return "[]"
      val lines = f.readLines().filter { it.isNotBlank() }
      f.delete()
      "[" + lines.joinToString(",") + "]"
    }

    /** Разовий запуск воркера expo-background-task → наш JS TaskManager.defineTask */
    fun wakeJs(context: Context) {
      @Suppress("UNCHECKED_CAST")
      val worker = Class.forName("expo.modules.backgroundtask.BackgroundTaskWork") as Class<out ListenableWorker>
      val data = Data.Builder().putString("appScopeKey", context.packageName).build()
      val request = OneTimeWorkRequest.Builder(worker).setInputData(data).build()
      WorkManager.getInstance(context).enqueueUniqueWork("bank-push-now", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
  }
}
