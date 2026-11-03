/**
 * Android home-screen widget (config plugin). The app already writes the chosen circle's members'
 * moods to SharedPreferences("InnerCircleWidget")/"widgetData" via the InnerCircleWidget native
 * module (modules/widget). This plugin adds the missing native UI target: an AppWidgetProvider that
 * reads that JSON and renders it, plus its manifest <receiver> and resource files, during prebuild.
 *
 * ⚠️ NATIVE + UNVERIFIABLE OFF-DEVICE: this runs at `expo prebuild` / EAS build and can only be
 * confirmed by installing an Android build and adding the widget to a home screen. (iOS has its own
 * WidgetKit extension in targets/widget, added by @bacons/apple-targets.)
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const tokens = require('../src/theme/tokens.cjs');

const APP_PACKAGE = 'com.lysm.app'; // must match android.package (app.config.ts BUNDLE_ID)
const PROVIDER = 'MoodWidgetProvider';
const PREFS = 'InnerCircleWidget';
const PREFS_KEY = 'widgetData';
const C = tokens.colors;

// Same rules as src/features/widget/layout.ts (and the iOS widget) — keep them in step.
const PROVIDER_KT = `package ${APP_PACKAGE}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

// Draws the Private-circle moods the app writes (src/features/widget/sync.ts), with the rules of
// src/features/widget/layout.ts: other members only; a mood shows while its entry is under 24 h old;
// 4 or fewer members -> everyone gets a row (blank when nothing recent); 5 or more -> the 4 most
// recent, one per person; newest first. Redrawn every 30 min (updatePeriodMillis) so the times and
// the 24 h cutoff stay current between app opens.
class ${PROVIDER} : AppWidgetProvider() {
  private data class Member(val name: String, val moods: String, val at: Long?)

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) render(context, manager, id)
  }

  private fun render(context: Context, manager: AppWidgetManager, id: Int) {
    val views = RemoteViews(context.packageName, R.layout.mood_widget)
    views.removeAllViews(R.id.mood_widget_rows)
    val now = System.currentTimeMillis()
    var title = "LYSM"
    var emptyText = "Open LYSM and choose a private circle in Profile, then Home Widget."
    var shown = 0

    try {
      val json = context.getSharedPreferences("${PREFS}", Context.MODE_PRIVATE).getString("${PREFS_KEY}", null)
      val root = if (json != null) JSONObject(json) else null
      val list = root?.optJSONArray("members")
      if (root != null && list != null && root.has("circle")) {
        title = root.optString("circle", "LYSM")
        val count = root.optInt("member_count", list.length())
        val members = (0 until list.length()).map { i ->
          val m = list.getJSONObject(i)
          val moodList = m.optJSONArray("moods")
          val moods = if (moodList == null) "" else (0 until moodList.length()).joinToString(", ") { moodList.optString(it) }
          Member(m.optString("name", "Member"), moods, if (m.isNull("at")) null else m.optLong("at"))
        }
        val recent = members.filter { isRecent(it.at, now) }.sortedByDescending { it.at ?: 0L }
        val rows: List<Pair<Member, Boolean>> = if (count <= MAX_ROWS) {
          val blank = members.filter { !isRecent(it.at, now) }.sortedBy { it.name.lowercase() }
          (recent.map { Pair(it, true) } + blank.map { Pair(it, false) }).take(MAX_ROWS)
        } else {
          recent.take(MAX_ROWS).map { Pair(it, true) }
        }
        for ((member, withMood) in rows) {
          val row = RemoteViews(context.packageName, R.layout.mood_widget_row)
          val at = member.at
          row.setTextViewText(R.id.mood_widget_initial, initialOf(member.name))
          row.setTextViewText(R.id.mood_widget_name, member.name)
          row.setTextViewText(R.id.mood_widget_time, if (withMood && at != null) relativeTime(at, now) else "")
          row.setTextViewText(R.id.mood_widget_mood, if (withMood) member.moods else "")
          row.setViewVisibility(R.id.mood_widget_mood, if (withMood && member.moods.isNotEmpty()) View.VISIBLE else View.GONE)
          views.addView(R.id.mood_widget_rows, row)
          shown++
        }
        emptyText = if (count == 0) "No one else is in this circle yet." else "No moods shared in the last 24 hours."
      }
    } catch (e: Exception) {
      // unreadable data: fall through to the empty state
    }

    views.setTextViewText(R.id.mood_widget_title, title)
    views.setTextViewText(R.id.mood_widget_empty, emptyText)
    views.setViewVisibility(R.id.mood_widget_empty, if (shown == 0) View.VISIBLE else View.GONE)

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launch != null) {
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      views.setOnClickPendingIntent(R.id.mood_widget_root, PendingIntent.getActivity(context, 0, launch, flags))
    }
    manager.updateAppWidget(id, views)
  }

  private fun isRecent(at: Long?, now: Long): Boolean =
    at != null && maxOf(0L, now - at) < WINDOW_MS

  private fun relativeTime(at: Long, now: Long): String {
    val minutes = maxOf(0L, now - at) / 60_000L
    if (minutes < 1L) return "Just now"
    if (minutes < 60L) return "$minutes min"
    val hours = minutes / 60L
    return if (hours == 1L) "1 hr" else "$hours hrs"
  }

  private fun initialOf(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return "?"
    return trimmed.substring(0, trimmed.offsetByCodePoints(0, 1)).uppercase()
  }

  companion object {
    private const val MAX_ROWS = 4
    private const val WINDOW_MS = 24L * 60L * 60L * 1000L
  }
}
`;

// ~4x4 cells: room for the circle name + 4 rows (avatar initial, name, time, moods).
const INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="250dp"
    android:targetCellWidth="4"
    android:targetCellHeight="4"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/mood_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
`;

const LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/mood_widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp"
    android:background="${C.surface}">
    <TextView
        android:id="@+id/mood_widget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="LYSM"
        android:textColor="${C.ink}"
        android:textStyle="bold"
        android:textSize="16sp"
        android:maxLines="1"
        android:ellipsize="end"
        android:paddingBottom="10dp" />
    <LinearLayout
        android:id="@+id/mood_widget_rows"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical" />
    <TextView
        android:id="@+id/mood_widget_empty"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:textColor="${C['ink-soft']}"
        android:textSize="13sp"
        android:visibility="gone" />
</LinearLayout>
`;

const ROW_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center_vertical"
    android:paddingVertical="6dp">
    <TextView
        android:id="@+id/mood_widget_initial"
        android:layout_width="40dp"
        android:layout_height="40dp"
        android:gravity="center"
        android:background="@drawable/mood_widget_initial_bg"
        android:textColor="${C.white}"
        android:textStyle="bold"
        android:textSize="16sp" />
    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:layout_marginStart="12dp"
        android:orientation="vertical">
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal">
            <TextView
                android:id="@+id/mood_widget_name"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:textColor="${C.ink}"
                android:textStyle="bold"
                android:textSize="14sp"
                android:maxLines="1"
                android:ellipsize="end" />
            <TextView
                android:id="@+id/mood_widget_time"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="${C['ink-soft']}"
                android:textSize="12sp"
                android:maxLines="1" />
        </LinearLayout>
        <TextView
            android:id="@+id/mood_widget_mood"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textColor="${C.ink}"
            android:textSize="14sp"
            android:maxLines="1"
            android:ellipsize="end" />
    </LinearLayout>
</LinearLayout>
`;

const INITIAL_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="${C.brand[500]}" />
</shape>
`;

function addReceiver(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  app.receiver = app.receiver ?? [];
  const name = `.${PROVIDER}`;
  if (app.receiver.some((r) => r?.$?.['android:name'] === name)) return manifest;
  app.receiver.push({
    $: { 'android:name': name, 'android:exported': 'false' },
    'intent-filter': [
      { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
    ],
    'meta-data': [
      { $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/mood_widget_info' } },
    ],
  });
  return manifest;
}

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

const withMoodWidget = (config) => {
  config = withAndroidManifest(config, (c) => {
    c.modResults = addReceiver(c.modResults);
    return c;
  });
  config = withDangerousMod(config, [
    'android',
    (c) => {
      const root = c.modRequest.platformProjectRoot; // .../android
      const main = path.join(root, 'app', 'src', 'main');
      writeFile(path.join(main, 'java', ...APP_PACKAGE.split('.'), `${PROVIDER}.kt`), PROVIDER_KT);
      writeFile(path.join(main, 'res', 'xml', 'mood_widget_info.xml'), INFO_XML);
      writeFile(path.join(main, 'res', 'layout', 'mood_widget.xml'), LAYOUT_XML);
      writeFile(path.join(main, 'res', 'layout', 'mood_widget_row.xml'), ROW_XML);
      writeFile(path.join(main, 'res', 'drawable', 'mood_widget_initial_bg.xml'), INITIAL_BG_XML);
      return c;
    },
  ]);
  return config;
};

module.exports = withMoodWidget;
