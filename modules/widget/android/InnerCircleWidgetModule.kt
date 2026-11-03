package expo.modules.innercirclewidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Native module the JS layer calls (src/features/widget/native.ts -> "InnerCircleWidget").
// Persists the members' moods JSON to SharedPreferences so the App Widget can read it.
class InnerCircleWidgetModule : Module() {
  private val prefsName = "InnerCircleWidget"
  private val key = "widgetData"

  override fun definition() = ModuleDefinition {
    Name("InnerCircleWidget")

    Function("setWidgetData") { json: String ->
      val ctx: Context = appContext.reactContext ?: return@Function
      ctx
        .getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        .edit()
        .putString(key, json)
        .apply()
    }

    // Broadcast an update to MoodWidgetProvider (added by ./plugins/withMoodWidget) so the widget
    // re-reads the JUST-written SharedPreferences JSON. Targets the provider by name (it lives in the
    // app package com.lysm.app, which this Expo module can't import at compile time). No-ops safely
    // when no widget is placed / the provider isn't present.
    Function("reloadAll") {
      val ctx: Context = appContext.reactContext ?: return@Function
      val provider = ComponentName(ctx.packageName, "com.lysm.app.MoodWidgetProvider")
      val manager = AppWidgetManager.getInstance(ctx)
      val ids = try {
        manager.getAppWidgetIds(provider)
      } catch (e: Exception) {
        return@Function // provider not registered in this build
      }
      if (ids.isEmpty()) return@Function
      val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
        component = provider
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
      }
      ctx.sendBroadcast(intent)
    }
  }
}
