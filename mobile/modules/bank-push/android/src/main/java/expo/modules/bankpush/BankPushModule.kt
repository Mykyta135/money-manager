package expo.modules.bankpush

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BankPushModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("BankPush")

    /** Чи дав користувач «Доступ до сповіщень» */
    Function("isEnabled") {
      val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
      val me = ComponentName(context, BankNotificationListener::class.java).flattenToString()
      flat.split(":").any { it == me }
    }

    Function("openSettings") {
      context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** JSON-масив подій з черги; черга очищається */
    Function("drain") {
      BankNotificationListener.drain(context)
    }

    /** Для тесту без справжнього банку: додати подію в чергу */
    Function("simulate") { pkg: String, title: String, text: String ->
      val event = org.json.JSONObject().put("pkg", pkg).put("title", title).put("text", text)
        .put("at", System.currentTimeMillis()).put("key", "test-${System.currentTimeMillis()}")
      BankNotificationListener.append(context, event.toString())
    }
  }
}
