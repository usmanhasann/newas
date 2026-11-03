# Home-screen widget

Shows the latest moods of the people in ONE of the user's **Private** circles on the phone's home
screen (client spec 2026-09-29). The circle is picked in-app: Profile → Home Widget (Private
circles only).

## What it shows (same rules on every platform)

- **Other members only** — never you.
- Each member's **newest mood in that circle**: a shared entry, or a post they tagged with a mood,
  whichever is newer, with **all** its moods as plain text, plus a relative time ("Just now",
  "25 min", "1 hr", "3 hrs"). Replies don't count. Only what the circle's feed shows you counts:
  nothing posted before you joined the circle.
- **24-hour cutoff:** once it's 24 hours old it disappears; the row goes blank, never stale.
- **4 or fewer other members:** everyone gets a row (blank when nothing recent).
  **5 or more:** only the 4 most recent entries, one row per person.
- **Newest first**; blank rows after, by name.
- Profile photo, or the member's initial on a colored circle when they haven't set one.

The rules live in `src/features/widget/layout.ts` (unit-tested) and are mirrored in the iOS Swift
and the Android Kotlin — keep all three in step.

## Data

`public.widget_feed(p_key, p_circle)` (migration `20260929140000_widget_feed.sql`, reading the one
circle feed since `20260929190000_circles_one_feed.sql`) returns the circle name, the number of other
members, and each member with their newest mood from the last 24 h (epoch-ms `at`). It is callable with only the public API key: the credential is a per-install,
**read-only widget key** (`create_widget_key()`; only its SHA-256 is stored; revocable; deleted with
the account). The widget can't use the app's login session — Supabase rotates refresh tokens, so a
second holder would sign the app out.

## iOS — `targets/widget` (WidgetKit, Large only)

Added at prebuild by [`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets)
(the Swift files in `targets/widget/` are the source of truth). The app writes the widget's
settings into the App Group `group.com.lysm.app` (`src/features/widget/native.ts`):
`widget.key`, `widget.circleId`, `widget.feedUrl`, `widget.apiKey`. The widget **fetches the feed
by itself** whenever iOS refreshes it (it asks for ~30 min; iOS decides — typically 15–60 min), so it
updates even when LYSM isn't open, and caches the last good data for offline, tagged with the circle
and key it came from (`widget.cachedFeedFor`), so another circle's or account's copy is never shown;
the app deletes the copy when the widget is switched off or the account signs out. Its timeline
re-renders every 15 min / hourly so the times and the 24-hour cutoff stay current between fetches.

First iOS build with the widget: EAS must create a signing profile for the new extension
(`com.lysm.app.widget`) and enable the App Group — run that build interactively (Apple login) or
give EAS an App Store Connect API key.

## Android — `plugins/withMoodWidget.js` + this module

`InnerCircleWidget` (Kotlin, `android/`) writes the feed JSON the app fetched to SharedPreferences
and asks the widget to redraw; the `MoodWidgetProvider` the config plugin adds draws it with the
same rules (initials, no photos) and redraws every 30 min. Android widgets can't fetch on their own
here, so new moods arrive when LYSM is opened (the app re-syncs on every return to the foreground).

## Lifecycle

`useWidgetSync()` (app root) ties the widget to the signed-in account: signing out, deleting the
account, signing in as someone else, or no account recorded yet (a reinstall: the iPhone keychain
keeps the old key) wipes this phone's widget settings and key. Signing out also revokes the key on the
server first (`revoke_widget_key`, via `src/store/signOutTasks.ts`). Every sync checks the feed
once, replacing a revoked key and clearing a circle that's no longer valid. Syncs run one at a time
and the newest request wins, so two quick picks always end on the second.

## Verify on a device

1. Build (EAS) and install. 2. Sign in, Profile → Home Widget → pick a Private circle.
3. Add the LYSM widget (Large) to the home screen. 4. Have another member share an entry to that
circle, or post there with a mood: it appears after the next refresh and disappears 24 hours after
it was posted.
