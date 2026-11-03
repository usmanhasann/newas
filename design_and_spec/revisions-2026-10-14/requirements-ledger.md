# Requirements ledger: client revisions 10/14/26

Every requirement from `Revisions-10_14_26.pdf` (and the client screenshots), split into single checkable lines with the client's exact words, mapped to our tasks. Built by 7 extraction passes, then checked by 2 independent full re-reads of the PDF (one forward, one backward with the screenshots); their corrections are applied. Lines marked ✚ were added by those checks.

Each task is done only when every line under it is ticked with proof.

**Status 2026-10-21:** every task was checked in the code against the client PDF and all 48 are now built; see `verification-2026-10-21.md` (per-task status, what is not live yet). The Old work lines are ticked; the New work lines are not ticked one by one yet: the verification was per task, and many lines are screenshot details that need a phone check after the build. "Context" lines explain the client's reasoning and are not ticked.

**838 lines**: Change 509, Exact text 175, Must not change 56, Context 78, Check existing 14, Outside the code 6.

## Old work

### O1 Greeting shows "there" instead of the user's name  (5)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O1.01 |  | 3 | Context | Greeting: when a user first joins and has no entries, the header currently says “Hello, there.” |  |
| O1.02 | [x] | 3 | Change | Change it to use the same time-of-day greeting with the user’s first name that the Journal tab already uses for everyone else |  |
| O1.03 | [x] | 3 | Exact text | Good afternoon, Konah | Example of format: time-of-day word varies; uses first name. |
| O1.04 | [x] | 3 | Change | There should always be a name saved | Overlaps O5 (Google/Apple sign-ups not saving name). |
| O1.05 | [x] | 3 | Change | it needs to pull a name 100 percent of the time. | Overlaps O5; existing Apple users without names can't be auto-recovered (p10). |

### O2 "Early Evening" capitalization on the onboarding notifications page  (2)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O2.01 | [x] | 4 | Change | Change “Early Evening” to “Early evening,” so it matches the style of the other options. |  |
| O2.02 | [x] | 4 | Exact text | Early evening | Trailing comma in PDF is sentence punctuation. |

### O3 Private Circles: a reply to a reply goes under the main post  (8)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O3.01 |  | 6 | Context | In Private Circles, replying to someone’s reply doesn’t work correctly. |  |
| O3.02 |  | 6 | Context | For example, I make a post, Auguste replies to it, and then I tap Reply on Auguste’s message. My reply shows up as a reply to my original post instead of a reply to Auguste’s message. |  |
| O3.03 | [x] | 6 | Change | Replies in Private Circles should work exactly the way they already do in Public Circles |  |
| O3.04 | [x] | 6 | Change | When a user taps Reply on someone’s reply, the new reply should be attached to that specific reply, not to the main post. |  |
| O3.05 | [x] | 6 | Change | It should show underneath the message it’s replying to, the same way Public Circles display it. |  |
| O3.06 | [x] | 6 | Change | Whoever’s message was replied to should be clearly shown, the same way Public Circles show it. |  |
| O3.07 | [x] | 6 | Check existing | Since this already works in Public Circles | Public Circle nested replies must keep working once both share one reply setup. |
| O3.08 | [x] | 6 | Change | please use the same reply setup for Private Circles so the two behave the same. |  |

### O4 First check-in text box hidden behind the keyboard  (10)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O4.01 |  | 6 | Context | On the onboarding screen “Let’s try your first check in.”, when the user taps the “What’s on your mind?” text box and the keyboard opens, the text box is currently squished or hidden. Only the label and the “Save & reflect” button are visible. |  |
| O4.02 | [x] | 6 | Change | The text box should be visible on screen by default, without needing to scroll down. | Title, moods, box and buttons now scroll as one, so the box is never pushed below the buttons. On short Android phones (360x640, 3-button nav) "Skip for now" then needs a small scroll; sign-off item. |
| O4.03 | [x] | 7 | Change | When the keyboard opens, the screen should automatically scroll so the text box is fully visible and centered in the space above the keyboard. | Label + box centered on every opening, iOS and Android (Android is edge-to-edge: the keyboard is measured). |
| O4.04 | [x] | 7 | Change | The user should be able to see what they’re typing the whole time. | Typing brings the box back if the user had scrolled it away. |
| O4.05 | [x] | 7 | Change | The text box should keep its normal size when the keyboard is open, never shrink or collapse. | Removed the 3-line cap; resting size kept; grows to a fixed height (never keyboard-dependent). |
| O4.06 | [x] | 7 | Change | As the user types more lines, the screen should keep scrolling so the line they’re typing stays visible above the keyboard. | Screen follows the growing box; past its max height the box scrolls inside and the phone keeps the line in view. |
| O4.07 | [x] | 7 | Change | While typing, the user should still be able to scroll up and down the screen without the keyboard closing or the text box losing focus. | No automatic scroll while the user drags or flings; swipes in the side margins scroll too. |
| O4.08 | [x] | 7 | Change | If the user taps anything outside the text box, like a mood, the keyboard closes and they leave the text box. | A mood tap closes the keyboard and picks the mood in one tap; empty space, top bar, Save, Skip and Back close it too. |
| O4.09 | [x] | 7 | Must not change | Everything they typed stays |  |
| O4.10 | [x] | 7 | Change | and they can tap back into the text box to keep typing where they left off. | Native caret placement; the box is centered again on reopening. |

### O5 Google and Apple sign-ups don't save the user's name  (13)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O5.01 |  | 10 | Context | Bug: users who sign up via "Continue with Google" or "Continue with Apple" aren't getting a name pulled from that account — the home screen greeting shows the literal placeholder "Good Evening, there" instead of an actual name. |  |
| O5.02 | [x] | 10 | Change | Fix: pull the user's name from the Google ... account they signed up with, and use it automatically. |  |
| O5.03 | [x] | 10 | Change | Fix: pull the user's name from the ... Apple account they signed up with, and use it automatically. |  |
| O5.04 | [x] | 10 | Must not change | Users can still change their name afterward in Profile settings if they want — this doesn't lock anything in |  |
| O5.05 | [x] | 10 | Change | it just gives every account a real name from the start instead of a broken placeholder. | Overlaps O1 ('pull a name 100 percent'). Fallback when the provider returns no name is undefined. |
| O5.06 |  | 10 | Context | Apple only includes the user's name in the sign-in response on the very first authorization a user ever grants your app — every sign-in after that, Apple returns nothing for the name field at all, permanently, even if the app asks again. |  |
| O5.07 | [x] | 10 | Change | This means the name has to be captured and saved to the user's profile at the exact moment of that first authorization, not fetched on-demand later. |  |
| O5.08 | [x] | 10 | Check existing | Whether the app's Sign in with Apple request is even asking for the name (the fullName scope) — if that scope was never requested, Apple won't return a name at all, first authorization or not. | Check for Muhammad: confirm the FULL_NAME scope is requested (iOS and the Android web flow) and fix it if not. |
| O5.09 | [x] | 10 | Check existing | Whether this was being captured and saved at that first-authorization moment, or just not read from the response at all. |  |
| O5.10 |  | 10 | Context | since Apple won't return the name again on future sign-ins, this fix only prevents the bug for new sign-ups going forward. |  |
| O5.11 |  | 10 | Context | Anyone already affected can't have their name automatically recovered — they'll need to set it manually in Profile settings. | Conflicts with O1 '100 percent'. Prompting affected Apple users to add a name is an unspecified design gap. |
| O5.12 | [x] | 10 | Change | Google sign-in doesn't have this same one-time limitation, so any Google-based accounts affected should be able to get their name pulled retroactively without issue. | Means backfilling names for existing Google accounts from the stored auth metadata. |
| O5.13 |  | 10 | Context | ✚ One critical, Apple-specific detail that has to be handled correctly, since it can't be fixed after the fact |  |

### O6 Onboarding summary sentences use the wrong word form  (13)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O6.01 |  | 11 | Context | Grammar bug on two onboarding summary screens — both share the same root cause, not two separate typos. |  |
| O6.02 |  | 11 | Context | these screens insert the short label text from an earlier multiple-choice answer directly into a new sentence, without adjusting its word form to fit. |  |
| O6.03 | [x] | 11 | Change | Example 1 — "The shift you're working toward" screen: currently shows "Right now: Stress most days." |  |
| O6.04 | [x] | 11 | Exact text | Right now: Stressed most days | Starts on p11, ends p12; no trailing period in the client's quote |
| O6.05 |  | 12 | Context | "Stress" is a noun, but the sentence needs an adjective describing the person's current state. |  |
| O6.06 | [x] | 12 | Change | Example 2 — the 100% onboarding summary checklist: currently shows "Steadying the overwhelm that shows up most days." |  |
| O6.07 | [x] | 12 | Exact text | Steadying the days that overwhelm you most | Unclear how this line changes for other frequency answers (e.g. Sometimes); needs a decision |
| O6.08 |  | 12 | Context | uses "overwhelm" as a verb instead of a noun, which fixes the awkwardness while still carrying the frequency idea. |  |
| O6.09 | [x] | 12 | Change | The fix isn't just correcting these two specific lines — it's checking every sentence template against every possible answer that could get inserted into it, so it reads correctly no matter which options a given user actually selected. |  |
| O6.10 |  | 11 | Context | ✚ A label written as a noun for a button ("Managing stress," "Most days") doesn't automatically become the right word form when dropped into a different sentence structure later. |  |
| O6.11 |  | 12 | Context | ✚ "overwhelm" as a bare noun here is awkward, especially since the actual onboarding question asked "how often do you feel overwhelmed" (the adjective form). |  |
| O6.12 |  | 12 | Context | ✚ each onboarding question has multiple possible answers, and different combinations of selections generate different versions of these sentences, most of which I haven't personally seen. |  |
| O6.13 |  | 12 | Context | ✚ especially since the actual onboarding question asked "how often do you feel overwhelmed" (the adjective form) |  |

### O7 Insights cards stay on an older period when a period has no entries  (23)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O7.01 |  | 13 | Context | when a period has zero journal entries, the Weekly Reflection card (and, it turns out, the Mood Breakdown card as well — see Fix below) doesn't show an empty state — it keeps displaying stale content from a completely different, earlier period, while still labeling it with the current period's date range. | Conflict: the reported case says the date label was frozen on the old period too |
| O7.02 |  | 13 | Context | Reported case: entries were made during Sep 14–20, and the reflection text (workout, getting matcha with Augie, etc.) is genuinely correct for that period — that part worked as expected. The empty period tested was the following week, Sep 21–27, where no entries were made at all. |  |
| O7.03 | [x] | 13 | Change | Once that period ended, the card should have advanced to Sep 21–27 and shown an empty state for it |  |
| O7.04 |  | 13 | Context | The bug is that a period with zero entries doesn't cause the card to advance at all; it just gets stuck displaying the last period that actually had content. |  |
| O7.05 | [x] | 13 | Change | this applies to both the Weekly Reflection card and the Mood Breakdown card — both need the same empty-state behavior when a period has zero entries, not just Reflection. |  |
| O7.06 | [x] | 13 | Change | Neither should get stuck showing an old period's content when the current one is empty. |  |
| O7.07 | [x] | 13 | Change | Wording should be consistent between the two cards, closely matching Mood Breakdown's existing empty-state pattern rather than introducing separate phrasing for each |  |
| O7.08 | [x] | 13 | Exact text | No entries in this period yet. Log a mood to see your patterns here. | Client says Mood Breakdown already shows this; keep it |
| O7.09 | [x] | 14 | Exact text | No entries in this period yet. Journal to see your reflection here. | Client wrote "something like": suggested wording, confirm. |
| O7.10 | [x] | 14 | Change | this empty state is not permanent, but it also doesn't refresh early just because a user starts journaling again |  |
| O7.11 | [x] | 14 | Change | it follows the exact same once-per-period locking schedule as everything else, not an instant update the moment a new entry is logged. |  |
| O7.12 | [x] | 14 | Change | Sep 21–27 has zero entries, so the empty state appears on Sep 28 (when that period would normally unlock) |  |
| O7.13 | [x] | 14 | Change | and stays displayed through the entire next period, Sep 28–Oct 4 — even if the user resumes journaling on Sep 28, the empty state for Sep 21–27 stays on screen the whole time, since Sep 28–Oct 4's own reflection isn't ready yet. |  |
| O7.14 | [x] | 14 | Change | Only on Oct 5, when Sep 28–Oct 4 unlocks, does the card update — and only then does it show a real reflection, assuming the user actually journaled during that period. |  |
| O7.15 | [x] | 14 | Change | If Sep 28–Oct 4 also ends up with zero entries, the card would show the empty state again on Oct 5, not a fallback to Sep 21–27's empty state or anything else. |  |
| O7.16 | [x] | 14 | Change | The empty state doesn't replace the whole card, just the main reflection text. |  |
| O7.17 | [x] | 14 | Change | The surrounding metadata should still show exactly as it does for a real reflection |  |
| O7.18 | [x] | 14 | Exact text | "Reflecting on [date range]" for the period that was empty |  |
| O7.19 | [x] | 14 | Exact text | "Your next reflection will be ready on [date]" below it. |  |
| O7.20 | [x] | 14 | Change | A user should still be able to see which period had nothing logged and when the next one unlocks, even while looking at the empty state. |  |
| O7.21 | [x] | 14 | Change | This applies to the Mood Breakdown card too, with whatever equivalent period/next-ready information it should be showing alongside its own empty-state message. | Likely the O20 date lines ("Your moods from..." / "Your breakdown will be ready on..."); confirm |
| O7.22 | [x] | 14 | Change | This should apply to all three views — weekly, monthly, and yearly — for both cards, not just weekly, same as the original locking spec. |  |
| O7.23 |  | 13 | Context | ✚ but instead it stayed completely frozen on the Sep 14–20 reflection — both the date label and the content. |  |

### O8 Sign-in with a different method on an existing email fails with no message  (1)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O8.01 | [x] | 15 | Change | Current bug: right now this just silently blocks the user with no explanation at all. | Fixed: Google's answer was read from the wrong part of the redirect, so refusals looked like success. Every refusal now shows a message; an existing account goes to Sign In; a Google account that already has LYSM signs in to it (as Apple does); Cancel stays silent. |

### O9 Loading spinner shows on the wrong sign-in button  (6)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O9.01 |  | 32 | Context | I've attached a screenshot of this bug. When a user taps "Continue with Apple," the Google button shows a loading spinner, even though nothing is happening with Google. |  |
| O9.02 | [x] | 32 | Change | The loading spinner should only appear on the button the user tapped. | One busy state per button on both screens; the tapped button is not grayed out. |
| O9.03 | [x] | 32 | Change | While it's loading, the other buttons can be grayed out so they can't be tapped | Including the email form's "Use a different sign-in option" link. |
| O9.04 | [x] | 32 | Change | but they should keep their normal text and icons. |  |
| O9.05 | [x] | 32 | Change | This applies to both screens. | Sign In: Apple's own native button can't show a spinner (nothing else spins while Apple runs); a spinner on Apple there comes with the N6 redesign. |
| O9.06 |  | 32 | Context (screenshot) | Bug screenshot: while the Apple sheet is open, the Google button's text and logo are entirely replaced by a gray spinner and all three buttons look dimmed. |  |

### O10 Colored icons on circle cards  (43)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O10.01 |  | 3 | Context | See the attached screenshot for how it should look. |  |
| O10.02 | [x] | 3 | Must not change | The Circles tab stays as it is now. |  |
| O10.03 | [x] | 3 | Must not change | The header … don’t change. |  |
| O10.04 | [x] | 3 | Must not change | … subtitle … don’t change. |  |
| O10.05 | [x] | 3 | Must not change | … the Create a circle … cards … don’t change. |  |
| O10.06 | [x] | 3 | Must not change | … Discover circles cards … don’t change. |  |
| O10.07 | [x] | 3 | Must not change | … the YOUR CIRCLES label … don’t change. |  |
| O10.08 | [x] | 3 | Must not change | … and the bottom tabs don’t change. |  |
| O10.09 |  | 3 | Context | The only change is to the circle cards under YOUR CIRCLES. |  |
| O10.10 | [x] | 3 | Change | Each card gets a colored circle icon on the left side, next to the circle’s name. |  |
| O10.11 | [x] | 3 | Change | Public Circles get a light green circle (#B9E8CB) | New hex value; must be added to tokens.cjs, not hard-coded. |
| O10.12 | [x] | 3 | Change | Public Circles get … a dark green globe icon (#1F5C3C). | New hex value; must be added to tokens.cjs, not hard-coded. |
| O10.13 | [x] | 3 | Change | Private Circles get a light purple circle (#EADBF8) | New hex value; must be added to tokens.cjs, not hard-coded. |
| O10.14 | [x] | 3 | Change | Private Circles get … a dark purple lock icon (#5A1F9A). | New hex value; must be added to tokens.cjs, not hard-coded. |
| O10.15 | [x] | 3 | Change | The icon circle should be about 46px wide |  |
| O10.16 | [x] | 3 | Change | … vertically centered in the card |  |
| O10.17 | [x] | 3 | Change | … with about 12px of space between it and the text. |  |
| O10.18 | [x] | 3 | Change | Remove the small globe or lock icon that currently sits before “Public · Owner” or “Private · Owner.” |  |
| O10.19 |  | 3 | Context | The new colored icon replaces it. |  |
| O10.20 | [x] | 3 | Must not change | The line itself stays, so it still reads “Public · Owner,” “Private · Member,” and so on. |  |
| O10.21 | [x] | 3 | Exact text | Public · Owner | Existing role line; trailing comma/period in PDF is sentence punctuation. |
| O10.22 | [x] | 3 | Exact text | Private · Owner | Existing role line; also shown in screenshot. |
| O10.23 | [x] | 3 | Exact text | Private · Member | Existing role line; "and so on" implies Public · Member too. |
| O10.24 | [x] | 3 | Must not change | The circle’s name … stay the same. |  |
| O10.25 | [x] | 3 | Must not change | … the Public/Private · Owner/Member line … stay the same. |  |
| O10.26 | [x] | 3 | Must not change | … and the arrow on the right stay the same. |  |
| O10.27 | [x] | 3 | Change | Archived circles: the colored icon fades along with the rest of the card | Overlaps N3 item 8 (fade archived cards); confirm whether archived cards already fade today. |
| O10.28 | [x] | 3 | Check existing | … and archived cards stay at the bottom of the list as they do now. | Overlaps N2 point 5 and N3 point 8 ordering rules. |
| O10.29 | [x] | 3 | Change | This applies to every circle in the YOUR CIRCLES list, whether the user owns it or is a member. |  |
| O10.30 | [x] | 3 | Change (screenshot) | Globe and lock glyphs are outline/stroke-style icons (not filled), centered inside the colored circle, matching the outline style of the Create/Discover card icons. |  |
| O10.31 | [x] | 3 | Change (screenshot) | Circle name is bold dark text on the first line; the role line (e.g. Public · Owner) is smaller, regular-weight gray text directly beneath; both left-aligned as one block to the right of the icon. |  |
| O10.32 | [x] | 3 | Change (screenshot) | The two-line name + role text block is vertically centered against the colored icon circle. |  |
| O10.33 | [x] | 3 | Change (screenshot) | Circle cards are a single compact row (shorter than the Create/Discover cards) showing only the name and the role line, with no description text. | Confirm current cards don't show a description; if they do, conflict with "stays the same". |
| O10.34 | [x] | 3 | Change (screenshot) | Colored icon circle is visibly larger than the light-purple icon circles on the Create a circle / Discover circles cards, and its left edge aligns with theirs. |  |
| O10.35 | [x] | 3 | Must not change (screenshot) | Circle cards are white with rounded corners and a thin light border, same full width and side margins as the Create/Discover cards, on the cream page background. | Appears to be the existing card style. |
| O10.36 | [x] | 3 | Must not change (screenshot) | Light gray chevron (>) at the right edge of each circle card, vertically centered. |  |
| O10.37 | [x] | 3 | Must not change (screenshot) | Vertical gap between stacked circle cards matches the gap between the Create a circle and Discover circles cards. |  |
| O10.38 | [x] | 3 | Must not change (screenshot) | Header "Konah's Circle" in large bold serif, left-aligned, with gray subtitle "Share how you feel with people who care." beneath it. | Reference only; verify current app header/subtitle match. |
| O10.39 | [x] | 3 | Must not change (screenshot) | Create a circle card: light purple circle with purple outline plus-in-circle icon, bold title, gray subtitle "Start a public or private circle and invite people" (no trailing period), chevron. | Subtitle lacks period while Discover's has one; PDF says don't change. |
| O10.40 | [x] | 3 | Must not change (screenshot) | Discover circles card: light purple circle with purple outline compass icon, bold title, gray subtitle "Have an invite code, or browse to find a circle to join.", chevron. |  |
| O10.41 | [x] | 3 | Must not change (screenshot) | YOUR CIRCLES label is small gray uppercase text with wide letter-spacing, left-aligned above the circle cards. |  |
| O10.42 | [x] | 3 | Must not change (screenshot) | Bottom tab bar is white with a top divider: Journal, Insights, Circles, Profile; active Circles tab icon and label are purple and bold, others gray. |  |
| O10.43 |  | 3 | Context (screenshot) | Screenshot lists the Public circle above the Private circle. | Order in the mock is incidental; N2 sorts by latest activity. |

### O11 New "No circles yet" text  (5)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O11.01 | [x] | 9 | Change | On the Circles tab, change the text in the “No circles yet” card to: |  |
| O11.02 | [x] | 9 | Exact text | Create a circle and invite people, or join one with a code. Once you’re in one, you can share your mood along with your AI reflection or written entry, and post with others in the circle. |  |
| O11.03 | [x] | 10 | Must not change | The title “No circles yet” stays the same. |  |
| O11.04 | [x] | 10 | Check existing | This card should only show when the user isn’t in any circles. |  |
| O11.05 | [x] | 10 | Check existing | Once they create or join one, it’s replaced by their list of circles. |  |

### O12 Leave circle from a ••• menu  (15)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O12.01 |  | 17 | Context | Right now, members who didn’t create a circle can only leave it by opening the Members tab and scrolling to the bottom of the list. That won’t work well once circles have hundreds or thousands of members. |  |
| O12.02 | [x] | 17 | Change | For members who aren’t the owner, add a ••• button in the top right of the circle |  |
| O12.03 | [x] | 17 | Change | in the same spot where owners see the Circle Settings gear icon. | Placement of the ••• button for non-owners; owners keep the gear in that spot. |
| O12.04 | [x] | 17 | Change | Tapping it opens a small menu with “Leave circle” in red. |  |
| O12.05 | [x] | 17 | Exact text | Leave circle | Menu item label, shown in red. |
| O12.06 | [x] | 17 | Change | Before leaving, show a confirmation: “Leave [circle name]?” with “Leave” and “Cancel” buttons. | Current confirm in CircleDetailScreen says 'Leave circle?' / 'You’ll stop seeing shared moods here.' - must be replaced. |
| O12.07 | [x] | 17 | Exact text | Leave [circle name]? | Confirmation title; [circle name] substituted. |
| O12.08 | [x] | 17 | Exact text | Leave | Confirmation button. |
| O12.09 | [x] | 17 | Exact text | Cancel | Confirmation button. |
| O12.10 | [x] | 17 | Change | For private circles, add: “You’ll need a new invite to rejoin.” | Private circles only; Public confirmation has no body line specified. |
| O12.11 | [x] | 17 | Exact text | You’ll need a new invite to rejoin. |  |
| O12.12 | [x] | 17 | Must not change | Keep the “Leave circle” option at the bottom of the Members tab too. |  |
| O12.13 | [x] | 17 | Must not change | Nothing changes for owners. |  |
| O12.14 | [x] | 17 | Must not change | They still see the gear icon |  |
| O12.15 | [x] | 17 | Must not change | and delete or archive the circle from Circle Settings. |  |

### O13 Circle description updates  (12)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O13.01 | [x] | 29 | Change | Add a 150-character limit to the circle description on the Create Circle screen |  |
| O13.02 | [x] | 29 | Change | Add a 150-character limit to the circle description on the Circle Settings screen |  |
| O13.03 | [x] | 29 | Change | Show a counter right below the text box that updates as the user types (0/150, 45/150, and so on) |  |
| O13.04 | [x] | 29 | Change | styled the same way as the counter on the profile bio. |  |
| O13.05 | [x] | 29 | Change | Users can't type past 150 characters. | Existing descriptions over 150 chars not addressed by client |
| O13.06 | [x] | 29 | Change | 2. Show the description inside public circles: When someone opens a public circle, show its description directly under the circle name at the top of the screen. | Public circles only; private circles not mentioned |
| O13.07 | [x] | 29 | Change | Use smaller, gray text, like the helper text elsewhere in the app. |  |
| O13.08 | [x] | 29 | Change | If the circle has no description, leave this space out completely, with no empty gap. |  |
| O13.09 | [x] | 29 | Change | 3. Remove the invite code from the feed: Remove the invite code box from the top of the circle's Feed tab. |  |
| O13.10 | [x] | 29 | Check existing | The invite code already shows when users tap the add-person icon in the top right corner, so that's where it will live from now on. |  |
| O13.11 | [x] | 29 | Change | Move the Feed and Members tabs up to fill the space. |  |
| O13.12 | [x] | 29 | Exact text | ✚ 0/150, 45/150, and so on | Counter format [count]/150. Ledger 583 has it only inside a change line. |

### O14 Streak Reminder description text  (4)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O14.01 | [x] | 1 | Change | On the Notifications screen, change the Streak Reminder's description from "A heads-up at 8 PM if your streak is about to end" to: |  |
| O14.02 | [x] | 1 | Exact text | A heads-up if your streak is about to end | Client gives no trailing period inside the quotes |
| O14.03 | [x] | 1 | Must not change | The reminder itself still goes out at 8 PM. |  |
| O14.04 | [x] | 1 | Must not change | Only the description text changes. |  |

### O15 Empty journal text: "Tap + New Entry"  (2)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O15.01 | [x] | 3 | Change | Empty journal text: in the “Your journal is empty” card, change “Tap the + button to log your first mood and write what’s on your mind.” to: “Tap + New Entry to log your first mood and write what’s on your mind.” |  |
| O15.02 | [x] | 3 | Exact text | Tap + New Entry to log your first mood and write what’s on your mind. |  |

### O16 Tap anywhere on Today's Moods to open a new entry  (6)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O16.01 | [x] | 6 | Change | On the home page, the "Today's Moods" card should open a new journal entry when tapped anywhere within it, not just when tapping directly on one of the mood circles. |  |
| O16.02 | [x] | 6 | Must not change | Right now, tapping a mood circle already opens a new entry — that behavior should stay exactly as it is. |  |
| O16.03 | [x] | 6 | Change | The fix is to extend that same tap target to the rest of the card |  |
| O16.04 | [x] | 6 | Change | so tapping the card background ... also opens a new entry |  |
| O16.05 | [x] | 6 | Change | tapping ... the header ... also opens a new entry | The header holds the streak badge (top right); confirm a badge tap also opens an entry. |
| O16.06 | [x] | 6 | Change | or any other empty space within the section also opens a new entry, the same as tapping a mood does now. | A tap off a mood can't preselect one; assume it opens the entry with no mood chosen. |

### O17 Real emoji in the streak indicator  (5)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O17.01 |  | 15 | Context | On the Today's Moods card, the streak indicator in the top-right corner (hourglass + flame + number, shown in the urgent state) currently uses custom-drawn icons that look off — not like real emoji, more like generic line-art approximations of them. |  |
| O17.02 | [x] | 15 | Change | use the actual native emoji characters instead of custom icons — 🔥 for the flame | Header names the urgent state; the flame presumably also changes in the normal state. Confirm |
| O17.03 | [x] | 15 | Change | and ⏳ for the hourglass. | The PDF shows U+23F3 (flowing sand), not U+231B |
| O17.04 | [x] | 15 | Change | These should render as the real, full-color emoji built into the phone (Apple’s on iPhone, the phone’s own on Android) |  |
| O17.05 | [x] | 15 | Change | not a custom SVG or icon-font substitute standing in for them. |  |

### O18 New "not ready yet" text on both Insights cards  (12)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O18.01 |  | 1 | Context | When the user has entries but their mood breakdown and reflection for the selected period aren't ready yet: | Condition that scopes all items below; new text applies only to the has-entries, not-ready state |
| O18.02 | [x] | 1 | Change | Mood Breakdown card: change "Your mood patterns will appear here once your [weekly/monthly/yearly] reflection unlocks. Unlocks on [date]." to: |  |
| O18.03 | [x] | 1 | Exact text | Your mood breakdown will show here after a full [week/month/year] of journaling. | Mood Breakdown card; separate paragraph from the Ready line |
| O18.04 | [x] | 1 | Exact text | Ready on [date]. | Mood Breakdown card's second line |
| O18.05 | [x] | 1 | Change | All text in this card should be centered. | Mood Breakdown card; probably only the not-ready state, wording doesn't say |
| O18.06 | [x] | 1 | Change | Reflection card: change "Keep Journaling. Your [Weekly/Monthly/Yearly] Reflection will unlock after a full [week/month/year] of journaling! Your next reflection will be ready on [date]." to: |  |
| O18.07 | [x] | 1 | Exact text | Your [weekly/monthly/yearly] reflection will show here after a full [week/month/year] of journaling. Keep going! | Reflection card; text runs from p1 onto p2 |
| O18.08 | [x] | 2 | Exact text | Ready on [date]. | Reflection card's second line; replaces 'Your next reflection will be ready on [date].' |
| O18.09 | [x] | 2 | Must not change | All text in this card should stay left-aligned, including the "[WEEKLY/MONTHLY/YEARLY] REFLECTION" label. | Reflection card only; opposite of the Mood Breakdown card's centering |
| O18.10 | [x] | 2 | Change | The words change to match the selected tab | week/month/year and weekly/monthly/yearly follow the Week/Month/Year tab |
| O18.11 | [x] | 2 | Change | and the date is the day it'll be ready |  |
| O18.12 | [x] | 2 | Exact text | Ready on September 7, 2027 | Date format example: full month name, day, year |

### O19 Insights no entries state: "Moods & Reflections"  (11)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O19.01 |  | 4 | Context | When the user hasn’t made any journal entries yet: |  |
| O19.02 | [x] | 4 | Change | Change the section label above the card from “MOOD BREAKDOWN” to “MOODS & REFLECTIONS.” |  |
| O19.03 | [x] | 4 | Exact text | MOODS & REFLECTIONS | Trailing period in PDF is sentence punctuation; label has no period. |
| O19.04 | [x] | 4 | Change | Change the text in the card from “Your mood patterns will appear here once your weekly reflection unlocks.” to: | Text must vary by selected Week/Month/Year tab. |
| O19.05 | [x] | 4 | Exact text | Week tab: “Start journaling to see your mood breakdown and weekly reflection here.” |  |
| O19.06 | [x] | 4 | Exact text | Month tab: “Start journaling to see your mood breakdown and monthly reflection here.” |  |
| O19.07 | [x] | 4 | Exact text | Year tab: “Start journaling to see your mood breakdown and yearly reflection here.” |  |
| O19.08 | [x] | 4 | Change | This only applies when the user has no entries. | Distinct from O18 (has entries, not ready) and O7 (period with zero entries). |
| O19.09 | [x] | 4 | Check existing | Once they make their first entry, the screen switches to the normal layout, with the “MOOD BREAKDOWN” and “REFLECTIONS” sections like it does now. |  |
| O19.10 | [x] | 4 | Exact text | MOOD BREAKDOWN | Existing normal-layout section label; keep. |
| O19.11 | [x] | 4 | Exact text | REFLECTIONS | Existing normal-layout label; verify current app uses REFLECTIONS (plural). |

### O20 Date lines on the Mood Breakdown card  (10)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O20.01 | [x] | 30 | Change | At the bottom of the Mood Breakdown card on the Insights tab, add two lines of small text, styled the same way as the dates at the bottom of the Weekly Reflection card: |  |
| O20.02 | [x] | 30 | Exact text | "Your moods from [start date] to [end date]" | No trailing period on this line |
| O20.03 | [x] | 30 | Exact text | (for example, "Your moods from Sep 28 to Oct 4") | Defines short date format: abbreviated month + day, no year |
| O20.04 | [x] | 30 | Exact text | "Your breakdown will be ready on [date]." |  |
| O20.05 | [x] | 30 | Exact text | (for example, "Your breakdown will be ready on October 12, 2026.") | Defines long date format: full month, day, year; differs from line one |
| O20.06 | [x] | 30 | Change | This applies to the weekly, monthly, and yearly views. |  |
| O20.07 | [x] | 30 | Change | The dates should update to match whichever view is selected |  |
| O20.08 | [x] | 30 | Change | and cover the same period as that view's reflection. |  |
| O20.09 | [x] | 30 | Change | These two date lines only show once a mood breakdown is showing. |  |
| O20.10 | [x] | 30 | Change | Before that, the “not ready yet” text replaces them, so both never show at the same time. | Interacts with O18 not-ready text and O7 empty-period metadata |

### O21 Onboarding notifications page: "Maybe later", 9 PM preselected, helper line  (10)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O21.01 | [x] | 4 | Change | Change “Add one later” to “Maybe later.” |  |
| O21.02 | [x] | 4 | Exact text | Maybe later | Trailing period in PDF likely sentence punctuation. |
| O21.03 | [x] | 4 | Change | Preselect “Before bed (9:00 PM)” when the page opens |  |
| O21.04 | [x] | 4 | Change | … so the “Turn on reminders” button is active right away. |  |
| O21.05 | [x] | 4 | Must not change | The user can still tap any other option to change it. |  |
| O21.06 | [x] | 4 | Exact text | Before bed (9:00 PM) | Existing option label; keep as is. |
| O21.07 | [x] | 4 | Exact text | Turn on reminders | Existing button label; keep as is. |
| O21.08 | [x] | 4 | Change | Add a small line of gray text |  |
| O21.09 | [x] | 4 | Change | … right under the “Custom time” option |  |
| O21.10 | [x] | 4 | Exact text | You can change this anytime in Profile → Notifications. |  |

### O22 Crisis resources pop-up as a half-screen sheet  (7)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O22.01 | [x] | 30 | Change | 1. When the user taps to open the crisis resources pop-up ("You're not alone in this") during onboarding, it should slide up from the bottom and cover only the bottom half of the screen. |  |
| O22.02 | [x] | 31 | Change | The top half of the onboarding screen should stay visible behind it, slightly dimmed. |  |
| O22.03 | [x] | 31 | Must not change | 2. The content inside the pop-up stays the same (988 Suicide & Crisis Lifeline, Crisis Text Line, and Outside the US). |  |
| O22.04 | [x] | 31 | Change | The pop-up should scroll so users can reach everything below what fits in the bottom half. |  |
| O22.05 | [x] | 31 | Change | 3. Add an X button in the top right corner of the pop-up. |  |
| O22.06 | [x] | 31 | Change | Tapping it closes the pop-up. |  |
| O22.07 | [x] | 31 | Change | 4. Tapping the dimmed top half of the screen should also close the pop-up. |  |

### O23 Remove the email from the Profile header  (4)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O23.01 | [x] | 1 | Change | Remove the email line shown under the user's name at the top of the Profile page. |  |
| O23.02 | [x] | 1 | Change | The header should only show the profile photo, name, and bio. |  |
| O23.03 | [x] | 1 | Change | Move the bio up to sit under the name so there's no empty gap where the email was |  |
| O23.04 | [x] | 1 | Change | but leave comfortable spacing between them so it doesn't look cramped. | Spacing between name and bio; no exact value given, must come from tokens |

### O24 Send Feedback: "What's working" and new pill style  (23)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O24.01 | [x] | 12 | Change | On the Send Feedback screen, the category selector needs two changes: a wording change and a visual update. |  |
| O24.02 | [x] | 12 | Change | "Praise" is being replaced with "What's working" |  |
| O24.03 | [x] | 12 | Exact text | What's working |  |
| O24.04 |  | 12 | Context | it reuses language already in the subtext right above it ("Tell us what's working or what could be better") | Existing subtext; not changed |
| O24.05 | [x] | 12 | Exact text | Final set: Idea, Bug, What's working, Other. | Also sets the order |
| O24.06 | [x] | 12 | Must not change | They stay as separate individual pills, not one connected track like the Week/Month/Year selector on Insights |  |
| O24.07 |  | 12 | Context | this is specifically about how each pill looks, not about merging them into a single control. |  |
| O24.08 | [x] | 13 | Change | Selected pill: solid purple fill, white text |  |
| O24.09 | [x] | 13 | Change | bold and unmistakable, not the current light purple tint with a thin border. |  |
| O24.10 | [x] | 13 | Change | Unselected pills: white background, no border |  |
| O24.11 | [x] | 13 | Change | with a soft drop shadow underneath for depth. |  |
| O24.12 |  | 13 | Context | This replaces the current flat outline look, which reads as underweighted and unfinished sitting on the cream background. |  |
| O24.13 | [x] | 13 | Must not change | Everything else about this screen (layout, spacing, the message box below it) stays the same — this is just the pill styling itself. |  |
| O24.14 | [x] | 12 | Must not change (screenshot) | A "CATEGORY" label sits above the pills in gray, bold, uppercase, letter-spaced caps. | Assumed existing label; PDF says layout stays |
| O24.15 | [x] | 12 | Change (screenshot) | Pills are fully rounded capsules sized to their text (not equal widths), with generous horizontal padding (~16px) and about 36px height. | Sizes estimated from a 2x reference image |
| O24.16 | [x] | 12 | Change (screenshot) | Pills wrap onto two left-aligned rows: "Idea" and "Bug" on the first row, "What's working" and "Other" on the second. | Wrapping likely follows from width; PDF says layout stays |
| O24.17 | [x] | 12 | Change (screenshot) | Gap between pills is about 8px both horizontally and between rows. |  |
| O24.18 | [x] | 12 | Change (screenshot) | Pill labels use a bold/semibold sans-serif in sentence case ("What's working" with a lowercase w). |  |
| O24.19 | [x] | 12 | Change (screenshot) | Unselected pill text is a muted dark gray/slate, not black and not purple. |  |
| O24.20 | [x] | 12 | Change (screenshot) | The selected pill has no visible border; its fill is the deep brand purple. |  |
| O24.21 | [x] | 12 | Change (screenshot) | The unselected-pill shadow is very light and diffuse (a soft glow mostly below the pill), not a hard shadow. |  |
| O24.22 |  | 12 | Context (screenshot) | "Idea" is shown as the selected pill in the reference image. | May be illustrative; PDF doesn't set a default selection |
| O24.23 |  | 12 | Context | ✚ is more accurately scoped to specific feedback on something that's landing well, rather than implying general enthusiasm for the app as a whole. |  |

### O25 Help & FAQ rewrite  (27)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O25.01 | [x] | 21 | Must not change | The design stays the same. |  |
| O25.02 |  | 21 | Context | Only the wording and the order change. |  |
| O25.03 | [x] | 21 | Change | Remove these cards: How do I get my trusted connections? |  |
| O25.04 | [x] | 21 | Change | Remove these cards: Can I control what each person sees? |  |
| O25.05 | [x] | 22 | Change | Replace all FAQ cards with the following, in this exact order: | Order: crisis, log mood, edit/delete, AI reflections, leave circle, who sees journal, Circles, streaks, subscription, support, delete account. |
| O25.06 | [x] | 22 | Exact text | I'm in crisis. What should I do? | Card 1 question. |
| O25.07 | [x] | 22 | Exact text | If you're in danger or thinking about harming yourself, please call 911 or call/text 988 (Suicide & Crisis Lifeline). LYSM also surfaces support resources when it detects concerning words as you write. | Card 1 answer. |
| O25.08 | [x] | 22 | Exact text | How do I log my mood? | Card 2 question. |
| O25.09 | [x] | 22 | Exact text | Tap the + New Entry button on the Journal tab, choose how you feel, write anything on your mind, then tap Save Entry. | Card 2 answer; verify button labels '+ New Entry' and 'Save Entry' match the app. |
| O25.10 | [x] | 22 | Exact text | Can I edit or delete an entry? | Card 3 question. |
| O25.11 | [x] | 22 | Exact text | Open an entry and tap the pencil to edit or the trash can to delete. | Card 3 answer. |
| O25.12 | [x] | 22 | Exact text | What are AI reflections? | Card 4 question. |
| O25.13 | [x] | 22 | Exact text | After you save an entry, LYSM writes a short reflection on it in the tone you picked (gentle, direct, encouraging, or reflective). Open the entry to read it. Change your tone in Profile → Reflection Tone. | Card 4 answer; 'Profile → Reflection Tone' depends on the N13 row existing. |
| O25.14 | [x] | 22 | Exact text | How do I leave a circle? | Card 5 question. |
| O25.15 | [x] | 22 | Exact text | Open the circle and tap the three dots in the top right, then Leave circle. If you are the owner of the circle, you can archive or delete it in Circle Settings. | Card 5 answer; depends on O12 ••• menu and N3 public-circle archive. |
| O25.16 | [x] | 22 | Exact text | Who can see my journal? | Card 6 question. |
| O25.17 | [x] | 22 | Exact text | Your entries are private by default. Only entries you explicitly share to a circle are visible. When you share, your mood is always included, and you choose whether to share your AI reflection or your written entry. | Card 6 answer. |
| O25.18 | [x] | 22 | Exact text | How do Circles work? | Card 7 question. |
| O25.19 | [x] | 22 | Exact text | Private Circles are invite-only groups for people you trust, where anyone can post and share entries. Public Circles are open to anyone: someone posts a prompt and others respond. Create or join a circle from the Circles tab. | Card 7 answer. |
| O25.20 | [x] | 22 | Exact text | How do streaks work? | Card 8 question. |
| O25.21 | [x] | 22 | Exact text | Your streak counts consecutive days with at least one entry. See the Insights tab. | Card 8 answer; verify the streak is actually shown on Insights. |
| O25.22 | [x] | 23 | Exact text | How do I change or cancel my subscription? | Card 9 question. |
| O25.23 | [x] | 23 | Exact text | Profile → Subscription opens your App Store or Google Play settings, where you can update or cancel anytime. Canceling during your free trial means you won't be charged. | Card 9 answer; verify Profile → Subscription actually opens store settings. |
| O25.24 | [x] | 23 | Exact text | How do I contact support? | Card 10 question. |
| O25.25 | [x] | 23 | Exact text | Email support@lysm.app. If there's something you'd like us to know, you can also go to the Send Feedback page and share your thoughts there. We read everything. | Card 10 answer; support@lysm.app mailbox must exist (client side). |
| O25.26 | [x] | 23 | Exact text | How do I delete my account? | Card 11 question. |
| O25.27 | [x] | 23 | Exact text | Go to Profile, scroll to the bottom, and tap Delete Account. This permanently deletes your account and all your entries. | Card 11 answer; verify Delete Account sits at the bottom of Profile. |

### O26 Day 3 trial reminder wording  (3)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O26.01 | [x] | 36 | Change | Day 3 trial reminder: the timeline promises “We remind you” on Day 3, so send a push notification on Day 3 of the free trial: |  |
| O26.02 | [x] | 36 | Exact text | “Your free trial ends in 2 days.” |  |
| O26.03 | [x] | 36 | Change | Apple doesn’t send this automatically, so it needs to be built. | O26 title implies wording only; client says build it; verify existing reminder |

### O27 Check: reflection notifications at 9 AM, skipped if already read  (4)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O27.01 |  | 8 | Context | These already work this way. No changes needed, just making sure they stay as is: |  |
| O27.02 | [x] | 8 | Check existing | Reflections become available at midnight on the day they’re ready |  |
| O27.03 | [x] | 8 | Check existing | but the notification goes out at 9 AM in the user’s local time. |  |
| O27.04 | [x] | 8 | Check existing | If the user already opened that reflection before 9 AM (for example, they were up at midnight and read it), don’t send the 9 AM notification for it. |  |

### O28 Check: no reflection notification for a period with no entries  (6)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O28.01 | [x] | 14 | Change | the weekly, monthly, and yearly reflection notifications (from the main Notifications spec) should only fire when a period unlocks with a real reflection actually generated from real entries. | O28 is a check task, but the client doesn't say this already works |
| O28.02 | [x] | 14 | Change | If a period is empty and shows the empty state instead, the notification should not fire at all |  |
| O28.03 | [x] | 14 | Change | this holds regardless of whether the user has that notification setting enabled. |  |
| O28.04 | [x] | 14 | Change | No "your recap is ready" notification should ever lead to an empty state on the other end | Also applies to N9's combined notification: name only periods that have real reflections |
| O28.05 | [x] | 14 | Change | Applies uniformly to weekly, monthly, and yearly. |  |
| O28.06 |  | 14 | Context | ✚ if there's nothing real to show, there's nothing to notify about. |  |

### O29 Check: streak popup only on the first entry of the day  (2)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O29.01 | [x] | 27 | Check existing | The streak popup only shows for the user's first entry of the day. |  |
| O29.02 | [x] | 27 | Must not change | For a second, third, or later entry on the same day, keep showing the current "Entry complete" popup instead, since the streak doesn't go up. |  |

### O30 Check: members can leave an archived circle  (1)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| O30.01 | [x] | 17 | Check existing | Members should still be able to leave a circle after it’s been archived. | Must work from both the new ••• menu and the Members tab. |

## New work

### N1 Real-time updates inside circles  (15)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N1.01 |  | 7 | Context | Right now, in both Public and Private Circles, new posts, prompts, and replies don’t show up until the user leaves the circle and opens it again. |  |
| N1.02 |  | 7 | Context | Notifications already work. | Existing circle push works today; point 6 (N8) later stops push while the app is open. |
| N1.03 |  | 7 | Context | For example, if Auguste replies while I’m in the circle, I get a notification that he replied, but his reply doesn’t appear on the screen until I leave and come back. |  |
| N1.04 | [ ] | 7 | Change | If two people are talking in a Private Circle, they shouldn’t have to keep leaving and coming back to see each other’s replies. |  |
| N1.05 | [ ] | 7 | Change | New posts, prompts, and replies from other members should appear on their own, without the user leaving the circle or pulling to refresh. |  |
| N1.06 | [ ] | 7 | Change | Likes ... should also update live. | Confirm what 'likes' maps to on circle posts (reactions/hearts). |
| N1.07 | [ ] | 7 | Change | reply counts ... should also update live. |  |
| N1.08 | [ ] | 7 | Change | edits ... should also update live. |  |
| N1.09 | [ ] | 7 | Change | and deleted posts should also update live. |  |
| N1.10 | [ ] | 7 | Change | If the user is scrolled down reading older posts when something new comes in, don’t jump them to the top. |  |
| N1.11 | [ ] | 7 | Change | Instead, show a small “New posts” button at the top that takes them to the new content when tapped. |  |
| N1.12 | [ ] | 7 | Exact text | New posts | Label of the jump-to-new button. |
| N1.13 | [ ] | 7 | Change | When the user opens a circle ... it should load anything new right away. |  |
| N1.14 | [ ] | 7 | Change | or comes back to the app after it was in the background, it should load anything new right away. |  |
| N1.15 | [ ] | 7 | Change | This applies to both Public and Private Circles. |  |

### N2 Sort Your Circles by latest activity  (12)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N2.01 | [ ] | 2 | Change | The circles under YOUR CIRCLES should be sorted by most recent activity |  |
| N2.02 | [ ] | 2 | Change | with the most recently active circle at the top. |  |
| N2.03 | [ ] | 2 | Change | Activity means a new post or a new reply in that circle | Prompts aren't named; unclear whether a Public Circle prompt counts as a post |
| N2.04 | [ ] | 2 | Change | from anyone, including the user. |  |
| N2.05 | [ ] | 2 | Change | When a circle gets new activity, it moves to the top of the list. |  |
| N2.06 | [ ] | 2 | Change | When a user joins or creates a circle, that also counts as activity, so the new circle goes to the top of their list. | Join/create time is per user, so ordering is per-user, not one global circle timestamp |
| N2.07 | [ ] | 2 | Change | If nothing happens in that circle after that, it moves lower as their other circles get new posts and replies. |  |
| N2.08 | [ ] | 2 | Change | Archived circles always stay at the bottom of the list, below all active circles. | p3 (O10) says archived already stay at bottom 'as they do now'; overlaps N3 item 8 |
| N2.09 | [ ] | 2 | Change | Among themselves, they follow the same order: most recent activity first. |  |
| N2.10 | [ ] | 2 | Change | The order should update in real time. | Relies on the same realtime setup as N1 |
| N2.11 | [ ] | 2 | Change | If someone posts in a circle while the user is on the Circles tab, that circle moves to the top without the user needing to refresh. |  |
| N2.12 | [ ] | 2 | Change | This applies to every circle in the list, Public or Private, whether the user is the owner or a member. |  |

### N3 Archiving and unarchive for Public Circles, with notifications  (29)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N3.01 |  | 23 | Context | Right now only Private Circles can be archived. |  |
| N3.02 | [ ] | 23 | Change | Please add the same Archive option to Public Circles, in Circle Settings next to “Delete circle,” for the circle’s owner. |  |
| N3.03 | [ ] | 23 | Change | When a Public Circle is archived: 1. People who already joined can still open it and read all the posts and replies. |  |
| N3.04 | [ ] | 23 | Change | 2. No one can post or reply anymore. |  |
| N3.05 | [ ] | 23 | Change | 3. It no longer shows up in Discover |  |
| N3.06 | [ ] | 23 | Change | and no one new can join. | Should cover every join path (Discover and any code/link), not only Discover. |
| N3.07 | [ ] | 23 | Change | 4. Show a small label at the top of the circle |  |
| N3.08 | [ ] | 23 | Exact text | This circle has been archived. |  |
| N3.09 | [ ] | 23 | Change | 5. Owners should be able to unarchive both Public and Private Circles from Circle Settings. |  |
| N3.10 | [ ] | 23 | Change | When a circle is archived, the “Archive circle” option should change to “Unarchive circle.” |  |
| N3.11 | [ ] | 23 | Exact text | Unarchive circle |  |
| N3.12 | [ ] | 23 | Change | 6. Unarchiving brings the circle back to normal: posting and replies work again | "Back to normal" presumably also re-enables new joins for Public Circles; not stated explicitly. |
| N3.13 | [ ] | 23 | Change | and a Public Circle shows up in Discover again. |  |
| N3.14 | [ ] | 23 | Change | 7. In the “Your Circles” section, archived circles should show “Archived” at the end of the gray line under the circle name | Applies to Public and Private Circles. |
| N3.15 | [ ] | 23 | Exact text | Private · Owner · Archived |  |
| N3.16 | [ ] | 24 | Exact text | Public · Member · Archived | Trailing period is sentence punctuation; displayed line likely has none. |
| N3.17 | [ ] | 24 | Change | This should show for everyone in the circle, not just the owner. |  |
| N3.18 | [ ] | 24 | Change | 8. Slightly fade archived circle cards. | p3 implies archived cards already fade; may be check-existing for Private. |
| N3.19 | [ ] | 24 | Change | As soon as a circle is archived, it should automatically move to the bottom of the user’s list, below all their active circles. | Overlaps N2 item 5 (archived at bottom, real-time order). |
| N3.20 | [ ] | 24 | Change | When it’s unarchived, it moves back up with their active circles. | Position among active circles presumably by latest activity (N2). |
| N3.21 | [ ] | 24 | Change | 9. When a circle is archived, send a notification to every member except the owner | Applies to Public and Private Circles. |
| N3.22 | [ ] | 24 | Exact text | “[Circle name] has been archived. You can still read it, but no new posts can be added.” |  |
| N3.23 | [ ] | 24 | Change | 10. When a circle is unarchived, send a notification to every member except the owner |  |
| N3.24 | [ ] | 24 | Exact text | “[Circle name] is active again. You can post and reply again.” |  |
| N3.25 | [ ] | 24 | Change | 11. These should follow each member’s notification setting for that circle (the bell icon). |  |
| N3.26 | [ ] | 24 | Change | If they’ve turned notifications off for that circle, they don’t get a push notification |  |
| N3.27 | [ ] | 24 | Change | but they still see it in the app’s notifications list. |  |
| N3.28 | [ ] | 23 | Exact text | ✚ Archive circle | Label of the new Archive option on Public Circles. Appears only inside ledger 475. |
| N3.29 | [ ] | 23 | Exact text | ✚ Archived | Suffix added to the gray role line. Only the full examples 480-481 are in the ledger. |

### N4 Account linking across Email, Google and Apple  (22)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N4.01 | [ ] | 15 | Change | whenever a sign-in attempt's email matches an existing account, trigger a linking flow instead of blocking |  |
| N4.02 | [ ] | 15 | Change | but never merge automatically. |  |
| N4.03 | [ ] | 15 | Change | Always verify it's genuinely the same person first. |  |
| N4.04 |  | 15 | Context | Which verification method to use depends on how the existing account was originally created |  |
| N4.05 | [ ] | 15 | Change | If the existing account has a password (created via email + password) → verify by entering that password. |  |
| N4.06 | [ ] | 15 | Change | If the existing account has no password (created via Google or Apple only) → verify by re-authenticating through whichever provider the account was originally created with. |  |
| N4.07 | [ ] | 15 | Change | Email + password account → signs in with Google → enter original password |  |
| N4.08 | [ ] | 16 | Change | Email + password account → signs in with Apple → enter original password |  |
| N4.09 | [ ] | 16 | Change | Google account → signs in with Apple → re-authenticate through Google |  |
| N4.10 | [ ] | 16 | Change | Google account → signs in with email + password → re-authenticate through Google, then set a new password |  |
| N4.11 | [ ] | 16 | Change | Apple account → signs in with Google → re-authenticate through Apple |  |
| N4.12 | [ ] | 16 | Change | Apple account → signs in with email + password → re-authenticate through Apple, then set a new password |  |
| N4.13 |  | 16 | Context | The two "set a new password" rows are different from the others — the user isn't confirming an existing credential, they're creating a brand new one that's never existed for this account. |  |
| N4.14 | [ ] | 16 | Change | That should only happen after the re-authentication step succeeds, not before. |  |
| N4.15 |  | 16 | Context | Apple "Hide My Email" — a cross-cutting issue affecting every scenario involving Apple, not just one. When someone signs in with Apple, they can choose to share a private relay address (e.g., xyz123@privaterelay.appleid.com) instead of their real email. Google always returns the person's actual email, with no equivalent privacy option. |  |
| N4.16 |  | 16 | Context | if Apple is involved anywhere in a user's sign-in history — as the original method or a later attempt — and they used Hide My Email, the email on file won't match what the other provider hands back, even though it's genuinely the same person. The automatic email-matching trigger won't fire, and without a fallback, this could silently create a second, disconnected account for someone who already has one. |  |
| N4.17 | [ ] | 16 | Change | This needs an explicit fallback (e.g., prompting the user to confirm manually if a match seems likely, or some other method) — not just assumed away, since it's a real path users can hit any time Apple sign-in is one of the methods involved. | The fallback design is open and needs sign-off; N5 section 5 (relay to real email) partly covers it |
| N4.18 | [ ] | 16 | Must not change | Important: nothing gets discarded when a new method is linked. |  |
| N4.19 | [ ] | 16 | Must not change | All linked methods stay fully functional side by side afterward. |  |
| N4.20 | [ ] | 16 | Must not change | The user would still be able to sign in with their original email and password, or with Google, or with Apple — any of the three leads to the same single account. |  |
| N4.21 | [ ] | 16 | Must not change | Linking adds a way in, it never removes one that already existed. |  |
| N4.22 | [ ] | 19 | Change | Linking: only verified emails should be able to trigger email-match account linking. | Mapped to N4 per hint. |

### N5 Sign-in & Security: email code, change email and password, forgot password by code  (82)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N5.01 |  | 17 | Context | Covers email verification at sign-up, changing email and password inside the app, forgot password, and Apple's "Hide My Email" addresses. |  |
| N5.02 |  | 17 | Context | Linking Google, Apple, and email sign-in to one account is covered in the Account linking section. This one covers everything around it. | Scope boundary with N4. |
| N5.03 | [ ] | 17 | Change | Where the in-app changes live: a new row on the Profile page called "Sign-in & Security," |  |
| N5.04 | [ ] | 17 | Exact text | Sign-in & Security | Profile row title. |
| N5.05 | [ ] | 17 | Change | placed near Subscription | Exact position (above/below Subscription) not specified. |
| N5.06 | [ ] | 17 | Change | with a short description under it like the other rows (for example, "Email and password"). |  |
| N5.07 | [ ] | 17 | Exact text | Email and password | Client wrote "for example": example subtitle. |
| N5.08 | [ ] | 17 | Change | Tapping it opens a screen with an "Email" row and a "Password" row. |  |
| N5.09 | [ ] | 17 | Exact text | Email | Row label on Sign-in & Security screen. |
| N5.10 | [ ] | 17 | Exact text | Password | Row label for accounts with a password. |
| N5.11 | [ ] | 18 | Must not change | Nothing for changing email or password goes on the sign-in page. |  |
| N5.12 | [ ] | 18 | Must not change | The sign-in page only has "Forgot password," for people who can't get in. | 'Forgot password?' already exists on LoginScreen/EmailSignInScreen; keep it after N6 redesign. |
| N5.13 | [ ] | 18 | Change | Accounts created with only Google or Apple see "Set a password" instead of "Password" (see section 3). |  |
| N5.14 | [ ] | 18 | Exact text | Set a password | Row label for Google/Apple-only accounts (also repeated in section 3). |
| N5.15 | [ ] | 18 | Change | Who it applies to: only email + password sign-ups. |  |
| N5.16 | [ ] | 18 | Change | Google and Apple already verify the email themselves, so those users skip this step. |  |
| N5.17 | [ ] | 18 | Change | Where it goes: immediately after the user taps Create Account, before the paywall. | Onboarding order change; interacts with N15 paywall flow and background reflection generation. |
| N5.18 | [ ] | 18 | Change | They can't continue to the paywall until the email is verified. |  |
| N5.19 | [ ] | 18 | Must not change | This keeps the screens after the paywall at the two that exist now (trial confirmation and notifications). |  |
| N5.20 | [ ] | 18 | Change | How it works: a short code (for example, 6 digits) is emailed, and the user types it into the app. | Needs Supabase Auth email template switched to OTP code (dashboard config). |
| N5.21 | [ ] | 18 | Change | A code, not a link, because a link sends people off to their mail app and some never come back. |  |
| N5.22 | [ ] | 18 | Change | The screen includes two options: "Resend code" (with a short cooldown) | Cooldown length not specified. |
| N5.23 | [ ] | 18 | Exact text | Resend code |  |
| N5.24 | [ ] | 18 | Exact text | Wrong email? Change it. |  |
| N5.25 | [ ] | 18 | Change | The second one fixes a typo by updating the email on the unverified account and sending a fresh code. |  |
| N5.26 |  | 18 | Context | Without these, the step is a dead end for the exact mistake it exists to catch. |  |
| N5.27 | [ ] | 18 | Change | Codes should expire after a short window. | Expiry window not specified. |
| N5.28 |  | 18 | Context | Why it's required: someone who mistypes their own email, or uses an address that isn't theirs, can journal for weeks without knowing. |  |
| N5.29 |  | 18 | Context | It also stops unverified accounts from squatting on someone else's email, which is what makes email-match account linking safe. |  |
| N5.30 | [ ] | 18 | Check existing | Older accounts: the existing rule that you must verify before joining a circle stays as a backstop. |  |
| N5.31 | [ ] | 18 | Change | Accounts created before this step existed (including test accounts) should be asked to verify the next time the app opens, not only when they try to join a circle. | Applies to existing unverified email+password accounts; Google/Apple accounts presumably exempt. |
| N5.32 | [ ] | 19 | Change | A confirmation code goes only to the new address, and the user types it into the app. |  |
| N5.33 | [ ] | 19 | Change | The change doesn't take effect until it's confirmed. |  |
| N5.34 | [ ] | 19 | Change | Nothing is required from the old address, because losing access to the old email is one of the main reasons people change it. | Supabase 'secure email change' (double confirm) must be disabled - dashboard config. |
| N5.35 | [ ] | 19 | Change | After the change goes through, send a heads-up to the old address saying the email was changed. | Notice email copy not specified. |
| N5.36 | [ ] | 19 | Change | It requires no action and doesn't block anything. |  |
| N5.37 |  | 19 | Context | If someone ever swaps the email on an account that isn't theirs, the real owner at least finds out. |  |
| N5.38 | [ ] | 19 | Change | If the new email already belongs to another LYSM account, block the change with a clear message. | Message copy not given; design gap to surface for sign-off. |
| N5.39 | [ ] | 19 | Change | Never merge the two accounts. |  |
| N5.40 | [ ] | 19 | Change | Require the current password before an email change. |  |
| N5.41 |  | 19 | Context | This keeps someone holding an unlocked phone from taking over the account. |  |
| N5.42 |  | 19 | Context | The one rare case it can’t cover is a user who is signed in, forgot their password, and no longer has access to their old email. | Support pointer copy/placement unspecified. |
| N5.43 | [ ] | 19 | Change | Send those users to support rather than weakening the check. |  |
| N5.44 | [ ] | 19 | Change | Google/Apple-only accounts: email is read-only, since the provider controls it. |  |
| N5.45 | [ ] | 19 | Change | The one exception is Apple relay addresses (section 5). |  |
| N5.46 | [ ] | 19 | Change | Linked sign-in must survive an email change. | Overlaps N4 identity linking. |
| N5.47 | [ ] | 19 | Change | Once Google or Apple is linked, the app should recognize that provider by its own account ID, not by the email text. | Overlaps N4; Supabase identities already key on provider sub - verify. |
| N5.48 |  | 19 | Context | Otherwise changing the email in LYSM quietly breaks Google or Apple sign-in. |  |
| N5.49 | [ ] | 19 | Change | Accounts with a password: changing it requires the current password. |  |
| N5.50 | [ ] | 19 | Change | The change screen also includes "Forgot your current password?", which sends the same reset email as the sign-in page's "Forgot password" so nobody hits a dead end. | Reset email now carries a code (section 4), not a link. |
| N5.51 | [ ] | 19 | Exact text | Forgot your current password? |  |
| N5.52 | [ ] | 20 | Change | After a password change, sign out the user's other devices. |  |
| N5.53 | [ ] | 20 | Change | Accounts with no password (Google or Apple only): the row says "Set a password." |  |
| N5.54 | [ ] | 20 | Change | The user must re-authenticate through the provider the account was created with first, and then can create a password. |  |
| N5.55 |  | 20 | Context | This matches the "set a new password" rows in the account linking table. | Shares re-auth flow with N4 linking table rows. |
| N5.56 | [ ] | 20 | Must not change | This stays the only way back in for someone who's locked out. |  |
| N5.57 | [ ] | 20 | Change | If the account is Google or Apple only, don't send an email. |  |
| N5.58 | [ ] | 20 | Change | Block the request on screen with a clear message instead, so the user isn't left waiting for an email that will never come | Reveals account existence/provider for an email; accepted by client spec. |
| N5.59 | [ ] | 20 | Exact text | This account uses Google sign-in, so there's no password to reset. Sign in with Google, or set a password under Sign-in & Security once you're in. | Apple variant swaps 'Google' for 'Apple' (both occurrences). |
| N5.60 | [ ] | 20 | Change | Name the provider the account was actually created with (Google or Apple). |  |
| N5.61 | [ ] | 20 | Change | If no account exists, no email is sent. | On-screen response for unknown email not specified. |
| N5.62 | [ ] | 20 | Change | Password reset uses a code, not a link, the same as email verification. | Needs Supabase recovery email template switched to OTP code (dashboard config). |
| N5.63 | [ ] | 20 | Change | The email contains a short code (for example, 6 digits) that the user types into the app before choosing a new password. |  |
| N5.64 | [ ] | 20 | Change | Codes expire after a short window |  |
| N5.65 | [ ] | 20 | Change | work only once |  |
| N5.66 | [ ] | 20 | Change | and lock after a few wrong attempts (the user can then request a new one). | Attempt limit not specified. |
| N5.67 | [ ] | 20 | Change | Resetting a password signs out the user's other devices. |  |
| N5.68 | [ ] | 20 | Change | None of this is assumed to exist today, and all of it needs to be built: code expiry, single use, the lockout after wrong attempts, and signing out other devices after a reset or a password change. | Restates items above; nothing may be assumed already working. |
| N5.69 | [ ] | 20 | Outside the code | Delivery: emails sent to Apple relay addresses (they end in privaterelay.appleid.com) only arrive if LYSM's sending domain and From address are registered with Apple. | Both sending domain AND From address need registering in Apple Developer email relay settings. |
| N5.70 |  | 20 | Context | Otherwise they bounce. This affects anything LYSM emails to a relay address, such as password resets for an Apple-created account that later sets a password. |  |
| N5.71 | [ ] | 20 | Outside the code | Register the sending domain with Apple | Apple Developer account access needed. |
| N5.72 | [ ] | 20 | Outside the code | and make sure the SPF record is set up correctly. | DNS access for the sending domain needed. |
| N5.73 | [ ] | 20 | Outside the code | This is not assumed to be set up today, and it needs to be done. |  |
| N5.74 |  | 21 | Context | Sign-in with a relay address: an Apple-only user who sets a password would have to sign in with email using a relay address they never see. |  |
| N5.75 | [ ] | 21 | Change | Let these users replace the relay address with their real email, |  |
| N5.76 | [ ] | 21 | Change | confirmed by a code sent to the new address, the same as section 2. |  |
| N5.77 | [ ] | 21 | Change | This is the one exception to "email is read-only for Google/Apple accounts." |  |
| N5.78 |  | 21 | Context | It also fixes the matching problem in account linking, where a relay address never matches the real email Google returns. | Relates to N4 Hide My Email fallback; not a full substitute for it. |
| N5.79 |  | 18 | Context | ✚ The real owner of that address could then use "Forgot password" and get into the journal. |  |
| N5.80 |  | 18 | Context | ✚ The real user would also never receive a reset email. |  |
| N5.81 |  | 18 | Context | ✚ Verification catches it while it can still be fixed. |  |
| N5.82 | [ ] | 19 | Change | ✚ Change email (inside the app, signed in only) | Section heading limits email change to signed-in, in-app use; no ledger item states this |

### N6 Sign-up and sign-in screens redesign  (42)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N6.01 |  | 31 | Context | I've attached images of both redesigned screens so you can see exactly what they should look like. |  |
| N6.02 | [ ] | 31 | Change | Both screens should use the same layout so they feel like one app. |  |
| N6.03 | [ ] | 31 | Change | In the center of the screen: the LYSM app icon (use the real app icon file) |  |
| N6.04 | [ ] | 31 | Change | with the headline under it in the serif heading font |  |
| N6.05 | [ ] | 31 | Change | and the subtext under that in smaller gray text. |  |
| N6.06 | [ ] | 31 | Change | At the bottom of the screen: the three sign-in buttons, stacked in this order: |  |
| N6.07 | [ ] | 31 | Change | 1. Continue with Apple (black button, white text, white Apple logo) |  |
| N6.08 | [ ] | 31 | Change | 2. Continue with Google (white button, light gray border, dark text, colored Google logo) |  |
| N6.09 | [ ] | 31 | Change | 3. Continue with Email (white button, light gray border, dark text, purple envelope icon) |  |
| N6.10 | [ ] | 31 | Exact text | Continue with Apple | Button label, both screens |
| N6.11 | [ ] | 31 | Exact text | Continue with Google | Button label, both screens |
| N6.12 | [ ] | 31 | Exact text | Continue with Email | Current sign-in label is "Sign in with Email" per bug screenshot |
| N6.13 | [ ] | 31 | Change | All three buttons should be the same size and shape, with the same text size and font. |  |
| N6.14 | [ ] | 31 | Change | Each icon sits right next to its text, and both are centered in the button. |  |
| N6.15 | [ ] | 31 | Must not change | Keep the progress bar at the top. |  |
| N6.16 | [ ] | 31 | Exact text | Headline: "Save your progress" |  |
| N6.17 | [ ] | 32 | Exact text | Subtext: "Create your account so your plan and entries are always here for you." |  |
| N6.18 | [ ] | 32 | Change | Under the buttons, in small gray text: |  |
| N6.19 | [ ] | 32 | Exact text | "By continuing, you agree to our Terms and Privacy Policy." |  |
| N6.20 | [ ] | 32 | Change | "Terms" and "Privacy Policy" should be purple links that open those pages. |  |
| N6.21 | [ ] | 32 | Must not change | Keep the back arrow in the top left corner, working the same way it does now. |  |
| N6.22 | [ ] | 32 | Must not change | No progress bar. | Current sign-in already has none per bug screenshot |
| N6.23 | [ ] | 32 | Exact text | Headline: "Welcome back" | Current screen already shows this per bug screenshot |
| N6.24 | [ ] | 32 | Exact text | Subtext: "Sign in to pick up right where you left off." | Current screen already shows this per bug screenshot |
| N6.25 | [ ] | 32 | Exact text | Don't have an account? Get started | Trailing comma is sentence punctuation; mock shows none |
| N6.26 | [ ] | 32 | Change | where "Get started" is a purple link that takes the user to onboarding. |  |
| N6.27 | [ ] | 31 | Change (screenshot) | Sign-up mock: warm cream/off-white background; icon, headline and subtext block sits in the upper-middle, with a large empty gap above the bottom-anchored buttons. |  |
| N6.28 | [ ] | 31 | Change (screenshot) | Sign-up mock: progress bar is a thin, rounded purple fill on a light gray track, nearly full (about 93%), spanning the width inside the side margins. |  |
| N6.29 | [ ] | 31 | Change (screenshot) | App icon is a rounded-square purple tile with the white serif lowercase "lysm" wordmark, about 90px wide, with a soft purple glow/shadow beneath it. |  |
| N6.30 | [ ] | 31 | Change (screenshot) | Headline is large, bold, near-black (dark navy) serif in sentence case, centered on one line. |  |
| N6.31 | [ ] | 31 | Change (screenshot) | Subtext is centered, regular-weight gray text that wraps to two lines under the headline. |  |
| N6.32 | [ ] | 31 | Change (screenshot) | Buttons are full-width pills (fully rounded ends), about 58px tall, with about 12px vertical gap; labels are bold dark text in sentence case with the provider name capitalized. |  |
| N6.33 | [ ] | 31 | Change (screenshot) | Apple button is solid black with no visible border; Google and Email buttons have white fill and a thin light warm-gray (beige) border. |  |
| N6.34 | [ ] | 31 | Change (screenshot) | Envelope icon is an outline (stroke) style in purple; Google logo is the multicolor G; Apple logo is solid white. |  |
| N6.35 | [ ] | 31 | Change (screenshot) | Legal line is small, centered gray text wrapping to two lines; "Terms" and "Privacy Policy" are purple and underlined; the final period stays gray. |  |
| N6.36 | [ ] | 31 | Change (screenshot) | Sign-in mock: back arrow is a bare thin dark chevron (<) with no circle or background, in the top left. |  |
| N6.37 | [ ] | 31 | Change (screenshot) | Sign-in mock: same icon, centered serif headline, centered gray subtext (wraps with "off." on line two) and same three buttons as sign-up. |  |
| N6.38 | [ ] | 31 | Change (screenshot) | Footer is one centered line: "Don't have an account?" in gray regular, "Get started" in bold purple and NOT underlined (unlike sign-up legal links); no trailing comma. |  |
| N6.39 | [ ] | 32 | Change (screenshot) | Current sign-in shows a purple circle with a heart and soft halo instead of the app icon; it is replaced by the real LYSM app icon. |  |
| N6.40 | [ ] | 32 | Change (screenshot) | Current sign-in button order is Google, Apple, Email, with "Sign in with Email"; new order is Apple, Google, Email with "Continue with Email". |  |
| N6.41 |  | 31 | Context (screenshot) | ✚ Sign-up mock shows no back arrow in the top left, only the progress bar. The sign-in mock does have one. | PDF says nothing about a sign-up back control. Confirm whether the current one stays. |
| N6.42 | [ ] | 31 | Change (screenshot) | ✚ Sign-up mock has no back arrow at the top, only the progress bar. The sign-in mock does have a back chevron. | PDF doesn't mention a sign-up back arrow; confirm whether the current onboarding back arrow is dropped |

### N7 Verified badges for well-known users  (23)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N7.01 |  | 5 | Context | When celebrities and influencers join LYSM, people could pretend to be them by copying their name, profile picture, and bio, for example to run a fake Public Circle. |  |
| N7.02 | [ ] | 5 | Change | To prevent this, add a verified badge that only we can give out. |  |
| N7.03 | [ ] | 5 | Change | Add a “verified” setting (on/off) to user accounts. |  |
| N7.04 | [ ] | 5 | Change | Only admins can turn it on or off, for example directly in Supabase. | RLS/column grants must stop users updating their own verified flag. |
| N7.05 | [ ] | 5 | Change | There’s no way for users to request it … in the app. |  |
| N7.06 | [ ] | 5 | Change | There’s no way for users to … turn it on themselves in the app. |  |
| N7.07 | [ ] | 5 | Outside the code | I’ll handle verifying people manually outside the app. |  |
| N7.08 | [ ] | 5 | Outside the code | When someone is confirmed, I’ll let you know or turn it on myself. | Client may need Supabase access or a documented admin procedure. |
| N7.09 | [ ] | 5 | Change | Verified users get a small purple check mark badge | No design comp given; badge shape/size is a design gap for sign-off. |
| N7.10 | [ ] | 5 | Change | … right after their name. |  |
| N7.11 | [ ] | 5 | Change | It should show everywhere their name appears: posts |  |
| N7.12 | [ ] | 5 | Change | It should show everywhere their name appears: … prompts |  |
| N7.13 | [ ] | 5 | Change | It should show everywhere their name appears: … replies |  |
| N7.14 | [ ] | 5 | Change | It should show everywhere their name appears: … member lists |  |
| N7.15 | [ ] | 5 | Change | It should show everywhere their name appears: … in-app banners | Depends on N8 in-app banners being built. |
| N7.16 | [ ] | 5 | Change | It should show everywhere their name appears: … notifications | Ambiguous for OS push text (plain text); likely in-app notifications list only. |
| N7.17 | [ ] | 5 | Change | It should show everywhere their name appears: … and the header of circles they own. |  |
| N7.18 | [ ] | 5 | Change | In Discover, Public Circles owned by a verified user should show the badge next to the owner’s name. | Check whether Discover cards currently show owner name at all. |
| N7.19 | [ ] | 5 | Change | If the setting is turned off, the badge disappears everywhere right away. | "Right away" implies no stale caching of verified status. |
| N7.20 | [ ] | 5 | Change | Don’t allow check mark characters or emojis in names, including ✓, ✔, ☑, ✅, and ☑️, so no one can fake the badge by typing it. | Validate client (Zod) and server; "including" implies broader set of check symbols. |
| N7.21 | [ ] | 5 | Exact text | Names can’t include check marks or verification symbols. |  |
| N7.22 | [ ] | 5 | Change | This applies when creating an account | Unclear handling for names auto-pulled from Google/Apple (O5) containing check marks. |
| N7.23 | [ ] | 5 | Change | … and when editing a name in Edit Profile. |  |

### N8 In-app notification banners for circle activity, reflections and streaks  (31)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N8.01 | [ ] | 7 | Change | No push notifications while the app is open: never send an iOS or Android push notification while the user has the app open, no matter what it’s for | Server needs to know when the app is in the foreground; local reminders also need suppressing in the foreground. Heading says it applies to every notification type. |
| N8.02 | [ ] | 8 | Change | … no matter what it’s for: circle activity | No push while the app is open, for circle activity. |
| N8.03 | [ ] | 8 | Change | reflections | No push while the app is open, for reflection notifications. |
| N8.04 | [ ] | 8 | Change | journaling reminders | Daily reminder is likely a locally scheduled notification; it must be suppressed or turned into a banner in the foreground. |
| N8.05 | [ ] | 8 | Change | streak reminders |  |
| N8.06 | [ ] | 8 | Change | … archived circles, and anything else | Archive and unarchive notifications come from N3. |
| N8.07 | [ ] | 8 | Change | Push notifications should only go out when the app is closed or in the background. |  |
| N8.08 | [ ] | 8 | Change | In-app banners instead: while the user is in the app, every notification should show as an in-app banner that slides down from the top of the screen, similar to Instagram. |  |
| N8.09 | [ ] | 8 | Change | Tapping the banner takes the user to whatever the notification is about. |  |
| N8.10 | [ ] | 8 | Change | The banner disappears on its own after about 4 seconds |  |
| N8.11 | [ ] | 8 | Change | or the user can swipe it up to dismiss it. |  |
| N8.12 | [ ] | 8 | Change | Banners follow the same notification settings as push notifications. |  |
| N8.13 | [ ] | 8 | Change | If a notification type is turned off, no banner shows. |  |
| N8.14 | [ ] | 8 | Change | No notifications on these screens: don’t show any banners while the user is in onboarding |  |
| N8.15 | [ ] | 8 | Change | on the paywall | No banners on any paywall, including the Welcome back paywall. |
| N8.16 | [ ] | 8 | Change | on the sign-in or sign-up screens |  |
| N8.17 | [ ] | 8 | Change | or while the crisis resources pop-up is open. | The crisis pop-up shows both in onboarding and in the app (flagged entries). |
| N8.18 | [ ] | 8 | Change | Anything that comes in during that time should still be saved to the in-app notifications list. | Reminders may not create list rows today; confirm which types get saved to the list. |
| N8.19 | [ ] | 8 | Exact text | [Name] in [Circle name] | Banner top line for a post. |
| N8.20 | [ ] | 8 | Exact text | [Name] replied in [Circle name] | Banner top line for a reply. |
| N8.21 | [ ] | 8 | Change | Second line: a one-line preview of what they wrote. |  |
| N8.22 | [ ] | 8 | Change | Tapping it opens the circle and goes straight to the post. | For a reply, unclear whether it lands on the parent post or on the reply itself. |
| N8.23 | [ ] | 8 | Change | If several posts come in at once, combine them into one banner | No length given for the 'at once' window. |
| N8.24 | [ ] | 8 | Exact text | [Name] and [N] others posted in [Circle name]. | Example: Auguste and 2 others posted in Konah’s Friends. |
| N8.25 | [ ] | 8 | Change | If the user is already viewing the circle where the activity happened, don’t show a banner, since they’ll see it appear live. |  |
| N8.26 | [ ] | 8 | Change | Banners follow each circle’s notification setting (the bell icon). |  |
| N8.27 | [ ] | 8 | Change | If notifications are off for that circle, no banner shows. |  |
| N8.28 | [ ] | 9 | Change | If the user is in the app at 9 AM (for example, writing a journal entry), show the reflection notification as an in-app banner instead of a push notification, following point 7. |  |
| N8.29 | [ ] | 9 | Change | Tapping it opens that reflection on the Insights tab. | The deep link should select the matching Week/Month/Year view. |
| N8.30 | [ ] | 9 | Change | If the user has an active streak and hasn’t journaled yet that day, and they’re in the app at 8 PM, show the streak reminder as an in-app banner instead of a push notification, following point 7. | The streak reminder is a server push at 8 PM local; the server needs to know the app is in the foreground. |
| N8.31 | [ ] | 9 | Change | Tapping it takes them straight to the Journal tab. |  |

### N9 One combined notification when several reflections are ready  (3)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N9.01 | [ ] | 9 | Change | If more than one reflection is ready on the same day, send one notification for all of them |  |
| N9.02 | [ ] | 9 | Exact text | Your weekly and monthly reflections are ready. | Example for weekly + monthly only; wording for other combinations to derive and confirm. |
| N9.03 | [ ] | 9 | Change | Tapping it opens the Insights tab. |  |

### N10 Join notifications for Public Circle owners  (9)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N10.01 | [ ] | 9 | Change | When someone joins a Public Circle, send a notification to the circle’s owner |  |
| N10.02 | [ ] | 9 | Exact text | [Name] joined [Circle name]. |  |
| N10.03 | [ ] | 9 | Change | Tapping it opens the circle’s Members tab. |  |
| N10.04 | [ ] | 9 | Change | If several people join close together, combine them into one notification | The 'close together' window is not defined and needs a decision. |
| N10.05 | [ ] | 9 | Exact text | [Name] and [N] others joined [Circle name]. | Example: Auguste and 4 others joined Konah Public Circle. |
| N10.06 | [ ] | 9 | Change | This notification is on by default. |  |
| N10.07 | [ ] | 9 | Change | The owner can turn it off in the circle’s notification settings (the bell icon), with its own toggle |  |
| N10.08 | [ ] | 9 | Exact text | New members | Client wrote "for example": example label. |
| N10.09 | [ ] | 9 | Change | It follows the same in-app rules as every other notification: in-app banner if the app is open, push notification if it’s closed. |  |

### N11 Streak milestones: popup messages and reminder wording  (81)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N11.01 | [ ] | 24 | Must not change | Keep the current popup design (buttons, styling) |  |
| N11.02 | [ ] | 24 | Change | but remove the checkmark icon at the top. |  |
| N11.03 | [ ] | 24 | Change | Replace the headline "1 day journaling, and counting" with three parts, stacked and centered. |  |
| N11.04 |  | 24 | Context | See the attached screenshot for the exact look. |  |
| N11.05 | [ ] | 24 | Change | The flame emoji and the user's current streak number side by side on one line, close together |  |
| N11.06 | [ ] | 24 | Change | with the number large and bold in the same serif font as the app's headings |  |
| N11.07 | [ ] | 24 | Change | "DAY STREAK" in smaller text directly under the number |  |
| N11.08 | [ ] | 24 | Exact text | DAY STREAK |  |
| N11.09 | [ ] | 24 | Change | A message line under that, in smaller, softer text (see the rules below) |  |
| N11.10 | [ ] | 24 | Change | The streak number must always match the streak shown on the Journal tab, Insights, and Profile. |  |
| N11.11 | [ ] | 25 | Must not change | Keep "See AI summary" as is. |  |
| N11.12 | [ ] | 25 | Change | Change "Go back to home" to "Back to home." |  |
| N11.13 | [ ] | 25 | Exact text | Back to home | Screenshot shows no trailing period. |
| N11.14 | [ ] | 25 | Change | Each day gets one message. |  |
| N11.15 | [ ] | 25 | Change | Check these in order and use the first one that applies: 1. Starting over after a broken streak 2. Milestone day 3. New longest streak 4. Day before a milestone 5. Regular day | If the first day past previous longest is a milestone, milestone wins and longest message never shows. |
| N11.16 | [ ] | 25 | Exact text | Day 1: Great start. Come back tomorrow to make it 2. | Displayed string is the text after 'Day N:' (same for all milestone items). |
| N11.17 | [ ] | 25 | Exact text | Day 3: 3 days in a row. You’re building something here. See you tomorrow. |  |
| N11.18 | [ ] | 25 | Exact text | Day 7: One full week! Let’s start week two tomorrow. |  |
| N11.19 | [ ] | 25 | Exact text | Day 14: Two weeks of checking in. Keep it going tomorrow. |  |
| N11.20 | [ ] | 25 | Exact text | Day 30: A whole month of showing up. Keep it going tomorrow. |  |
| N11.21 | [ ] | 25 | Exact text | Day 50: 50 days. Halfway to 100. See you tomorrow. |  |
| N11.22 | [ ] | 25 | Exact text | Day 100: 100 days. Tomorrow starts the next hundred. |  |
| N11.23 | [ ] | 25 | Exact text | Day 150: 150 days of showing up for yourself. See you tomorrow. |  |
| N11.24 | [ ] | 25 | Exact text | Day 200: 200 days. That’s who you are now. See you tomorrow. |  |
| N11.25 | [ ] | 25 | Exact text | Day 250: 250 days. A quarter of the way to 1,000. See you tomorrow. |  |
| N11.26 | [ ] | 25 | Exact text | Day 300: 300 days. One year is right around the corner. |  |
| N11.27 | [ ] | 25 | Exact text | Day 365: One full year of journaling. Tomorrow starts year two. |  |
| N11.28 | [ ] | 26 | Exact text | Day 500: 500 days. Few people ever get here. See you tomorrow. |  |
| N11.29 | [ ] | 26 | Exact text | Day 1,000: 1,000 days. Truly incredible. See you tomorrow. |  |
| N11.30 | [ ] | 26 | Change | After day 365, these also count as milestones: Every yearly anniversary (730, 1,095, 1,460, and so on) |  |
| N11.31 | [ ] | 26 | Exact text | "[Y] years of journaling. Tomorrow starts year [Y+1]." Here [Y] is the number of years. |  |
| N11.32 | [ ] | 26 | Change | Every 100 days not listed above (400, 600, 700, 800, 900, 1,100, and so on) |  |
| N11.33 | [ ] | 26 | Exact text | "[X] days. See you tomorrow for [X+1]." |  |
| N11.34 | [ ] | 26 | Change | If a day is both a yearly anniversary and on another list, use the anniversary message. |  |
| N11.35 | [ ] | 26 | Exact text | “Your longest streak yet. Let's beat it again tomorrow.” | PDF mixes straight and curly apostrophes across messages; pick one style consistently. |
| N11.36 | [ ] | 26 | Change | Show this only on the first day the user passes their previous longest streak, not on every day after. | Needs stored previous-longest value that excludes the current run. |
| N11.37 | [ ] | 26 | Change | Never show it during a user's first-ever streak. |  |
| N11.38 | [ ] | 26 | Exact text | Tomorrow is day [X]. Don't miss it. | Here [X] = next milestone day, conflicting with section 9 where [X] = current streak. |
| N11.39 | [ ] | 26 | Change | [X] is the next milestone day. |  |
| N11.40 | [ ] | 26 | Change | This applies to every milestone in section 4, including anniversaries and every-100-days milestones. |  |
| N11.41 | [ ] | 26 | Exact text | For example, on day 29: "Tomorrow is day 30. Don't miss it." |  |
| N11.42 | [ ] | 26 | Change | If the user is on day 1 but has had a streak before, show this instead of the regular day 1 message: | "Had a streak before" undefined: any prior entry day vs a prior streak of 2+ days. |
| N11.43 | [ ] | 26 | Exact text | Every streak starts with day 1. Come back tomorrow to make it 2. |  |
| N11.44 | [ ] | 27 | Change | For any day that doesn't fit the rules above, randomly pick one of these lines: |  |
| N11.45 | [ ] | 27 | Exact text | See you tomorrow for day [X+1]. |  |
| N11.46 | [ ] | 27 | Exact text | Day [X] done. Tomorrow makes [X+1]. |  |
| N11.47 | [ ] | 27 | Exact text | Another day for you. See you tomorrow. |  |
| N11.48 | [ ] | 27 | Exact text | Keep showing up. Day [X+1] is tomorrow. |  |
| N11.49 | [ ] | 27 | Change | Do not show the same line two days in a row. | Requires persisting the last regular line shown. |
| N11.50 | [ ] | 27 | Change | Replace [X] with the user's current streak number, and [X+1] with the next day's number. |  |
| N11.51 | [ ] | 27 | Change | Use commas in numbers 1,000 and higher. |  |
| N11.52 | [ ] | 27 | Must not change | The timing and on/off settings for both notifications stay exactly as they are now. |  |
| N11.53 | [ ] | 27 | Change | Only the wording changes, based on the user's streak. |  |
| N11.54 | [ ] | 27 | Change | [X] is the user's current streak, counting through yesterday. | Differs from popup's [X] (streak including today). |
| N11.55 | [ ] | 27 | Change | [X+1] is what their streak becomes if they journal today. |  |
| N11.56 | [ ] | 28 | Change | Milestone days are the same ones from the streak popup spec: 3, 7, 14, 30, 50, 100, 150, 200, 250, 300, 365, 500, and 1,000, plus every yearly anniversary (730, 1,095, and so on) and every 100 days after 365 (400, 600, 700, and so on). | Excludes day 1, unlike popup section 4; share one milestone helper. |
| N11.57 | [ ] | 28 | Must not change | Regular days: no change. Keep using the 7-prompt rotation, exactly how it works now. |  |
| N11.58 | [ ] | 28 | Change | Milestone days: if the user hasn't journaled yet today and [X+1] is a milestone, replace that day's rotating prompt in the notification with: |  |
| N11.59 | [ ] | 28 | Exact text | Today could be day [X+1]. Take a minute to check in. |  |
| N11.60 | [ ] | 28 | Exact text | For example: "Today could be day 30. Take a minute to check in." |  |
| N11.61 | [ ] | 28 | Change | If the user has already journaled today by the time the reminder goes out, use the normal rotating prompt instead. | Daily reminder is local-scheduled; content must be decided at send time. Check current scheduling. |
| N11.62 | [ ] | 28 | Must not change | The home page subtitle (under "Good evening, [name]") always shows the regular rotating prompt, even on milestone days. Only the notification changes. |  |
| N11.63 | [ ] | 28 | Change | Milestone days don't affect the rotation. The next day continues the rotation as normal. |  |
| N11.64 | [ ] | 28 | Must not change | This still only sends at 8 PM when the user has an active streak and hasn't journaled yet that day. |  |
| N11.65 | [ ] | 28 | Change | Use the first message below that applies: 1. If [X+1] is a milestone: |  |
| N11.66 | [ ] | 28 | Exact text | Don’t lose your [X] day streak. Check in before midnight to reach day [X+1]. |  |
| N11.67 | [ ] | 28 | Change | 2. If [X+1] would beat the user's longest streak: | If longest includes current run, this fires every day once on a record streak; clarify first-time-only. |
| N11.68 | [ ] | 29 | Exact text | Check in before midnight to achieve your longest streak. |  |
| N11.69 | [ ] | 29 | Change | Never use this during a user's first-ever streak. |  |
| N11.70 | [ ] | 29 | Must not change | 3. Otherwise: no change. Keep using the current streak reminder messages, exactly how they work now. |  |
| N11.71 | [ ] | 29 | Change | Replace [X] and [X+1] with the actual numbers. |  |
| N11.72 | [ ] | 29 | Change | Use commas in numbers 1,000 and higher. |  |
| N11.73 | [ ] | 29 | Change | Both notifications use the user's current device timezone to decide what "today" and "midnight" mean. | Depends on N14 device-timezone sync. |
| N11.74 | [ ] | 24 | Change (screenshot) | Popup is a white card with large rounded corners, shown over a dimmed gray backdrop. |  |
| N11.75 | [ ] | 24 | Change (screenshot) | Flame emoji sits immediately left of the streak number at about the same height as the numeral; the emoji+number pair is centered horizontally and is the topmost element in the card. |  |
| N11.76 | [ ] | 24 | Change (screenshot) | Streak number is very large bold serif in near-black/dark navy (heading text color), not purple. |  |
| N11.77 | [ ] | 24 | Change (screenshot) | "DAY STREAK" is all caps, letter-spaced (tracked out), semibold sans-serif in dark gray, sitting tight under the number. |  |
| N11.78 | [ ] | 24 | Change (screenshot) | Message line is regular-weight sans-serif in a lighter gray than the DAY STREAK label, centered, wrapping onto two centered lines ("Great start. Come back / tomorrow to make it 2."). |  |
| N11.79 | [ ] | 24 | Change (screenshot) | "See AI summary" is a near-full-width, fully rounded pill button with solid purple fill, bold white text, and a white sparkle icon left of the label. |  |
| N11.80 | [ ] | 24 | Change (screenshot) | "Back to home" is a plain text link (no fill, no border) in bold purple text, centered below the primary button. |  |
| N11.81 | [ ] | 24 | Change (screenshot) | Spacing: number row, DAY STREAK label and message are grouped closely; a larger gap separates the message from the See AI summary button, and a medium gap separates that button from Back to home. |  |

### N12 New "You're all set" icon and entrance animation  (20)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N12.01 | [ ] | 11 | Change | On the "You're all set" trial confirmation screen, the icon in the middle changes — screen recording of the target animation is attached below. |  |
| N12.02 |  | 11 | Context | currently a checkmark circle surrounded by a lighter purple halo ring, with several small colored dots scattered around it. |  |
| N12.03 | [ ] | 11 | Change | Remove the halo ring and all the dots entirely. |  |
| N12.04 | [ ] | 11 | Change | just a solid purple circle with a white checkmark inside it. |  |
| N12.05 | [ ] | 11 | Change | Nothing else around it. |  |
| N12.06 | [ ] | 11 | Change | Entrance animation, plays once when the screen appears, then holds still |  |
| N12.07 | [ ] | 11 | Change | The purple circle pops in first — scales up from slightly smaller to full size while fading in |  |
| N12.08 | [ ] | 11 | Change | with a slight bounce/overshoot on the scale rather than a flat linear motion. |  |
| N12.09 | [ ] | 11 | Change | Right after the circle settles, the checkmark draws itself in with a quick stroke animation |  |
| N12.10 | [ ] | 11 | Change | it should look like it's being drawn stroke-by-stroke, not just fading into view all at once. |  |
| N12.11 | [ ] | 11 | Change | Once the checkmark finishes drawing, everything holds completely still. |  |
| N12.12 | [ ] | 11 | Change | No looping, no continuous pulsing — this is a one-time entrance, not an ongoing animation. |  |
| N12.13 | [ ] | 11 | Change | Total sequence should feel quick, well under a second |  |
| N12.14 |  | 11 | Context | the recording attached shows the actual intended timing and feel. | Recording is the user's Downloads .mov; not decodable here (no ffmpeg), so timing unverified |
| N12.15 | [ ] | 11 | Change (screenshot) | Checkmark is a single white tick drawn with a thick stroke and rounded line caps/joins, centered in the circle, spanning roughly 55-60% of the circle's width. |  |
| N12.16 | [ ] | 11 | Change (screenshot) | The purple circle is large, about 40% of the screen width (~145px on a ~367px-wide frame), a flat solid fill with no border, shadow or gradient. |  |
| N12.17 | [ ] | 11 | Change (screenshot) | The circle fill appears to be the same deep brand purple as the full-width Continue button. | Use the primary purple token; no new color |
| N12.18 | [ ] | 11 | Change (screenshot) | The icon is centered horizontally and sits above the "You're all set." headline with a generous gap (about 80px at frame scale). |  |
| N12.19 |  | 11 | Context (screenshot) | The rest of the screen looks unchanged: cream background, "You're all set." headline in bold dark serif, centered; centered gray body text; full-width rounded purple "Continue" button with white text at the bottom. | PDF only changes the icon; inferred that everything else stays |
| N12.20 |  | 11 | Context (screenshot) | Body copy shown: "Your 5-day free trial is active until Sep 29, 2026. We'll send a friendly reminder before it ends — then it renews at $29.99/year. No surprises." | Not a requirement. Has an em dash and hardcoded $29.99, which conflicts with N17 store prices |

### N13 Reflection Tone as its own Profile row  (9)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N13.01 | [ ] | 21 | Change | Remove the reflection tone setting from the Edit Profile screen. |  |
| N13.02 | [ ] | 21 | Change | Edit Profile should only include name, photo, and bio. | Timezone field removal from Edit Profile is separately N14 (p30); both lead to name/photo/bio only. |
| N13.03 | [ ] | 21 | Must not change | Its subtitle stays "Update your name, photo, and bio." |  |
| N13.04 | [ ] | 21 | Change | On the Profile page, add a new row in the Account section, directly below Edit Profile, styled the same as the other rows (icon, title, subtitle, arrow) | Icon for the row not specified; design gap to pick and surface. |
| N13.05 | [ ] | 21 | Exact text | Title: Reflection Tone |  |
| N13.06 | [ ] | 21 | Exact text | Subtitle: Choose how your AI reflections are written | No trailing period in client copy. |
| N13.07 | [ ] | 21 | Change | Tapping the row opens a Reflection Tone screen showing the same 4 tones from onboarding: gentle, direct, encouraging, and reflective. | Save behavior (auto-save vs Save button) not specified. |
| N13.08 | [ ] | 21 | Change | The rules are the same as onboarding: users must pick at least 1 and can pick up to 2. |  |
| N13.09 | [ ] | 21 | Change | Their current selection should already be shown when the screen opens. |  |

### N14 Remove the timezone setting, follow the phone's timezone  (7)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N14.01 | [ ] | 30 | Change | 1. Remove the Timezone field (and its "Use device" button and helper text) from the Edit Profile screen. |  |
| N14.02 | [ ] | 30 | Change | 2. The app should automatically use whatever timezone the user's phone is set to. |  |
| N14.03 | [ ] | 30 | Change | Check it every time the app opens or comes back from the background, and update it if it changed. |  |
| N14.04 | [ ] | 30 | Change | For example, if a user on West Coast time flies to the East Coast, the app should switch to Eastern time once their phone does. |  |
| N14.05 | [ ] | 30 | Change | 3. Streaks, the mood breakdown, and reflections should all use the user's current device timezone to decide what counts as "today." |  |
| N14.06 | [ ] | 30 | Change | 4. Traveling should never break a streak on its own. |  |
| N14.07 | [ ] | 30 | Change | An entry counts toward the day it was written, based on the local time on the user's phone at that moment. | Implies storing each entry's local day/offset at write time |

### N15 Paywall redesign with the first reflection and Welcome reflection card  (101)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N15.01 |  | 32 | Context | I’ve attached images of both new paywall designs (the main paywall and the Welcome back paywall) so you can see exactly what they should look like. |  |
| N15.02 | [ ] | 32 | Change | The main paywall replaces both current paywall screens (Annual and Monthly) with one screen. |  |
| N15.03 | [ ] | 33 | Change | Remove the AI summary page that currently shows right after “Let’s try your first check in.” |  |
| N15.04 | [ ] | 33 | Change | When the user taps “Save & reflect,” run the concerning-words check first (see section 8). | Overlaps N18 check-before-OpenAI |
| N15.05 | [ ] | 33 | Change | If the entry isn’t flagged, send it to OpenAI right away, using the reflection tone they picked earlier in onboarding. |  |
| N15.06 | [ ] | 33 | Change | The reflection should generate in the background while they create their account, so it’s ready by the time they reach the paywall. | Generation starts before an account exists; needs pre-auth server path (sign-off) |
| N15.07 | [ ] | 33 | Change | If the user taps “Skip for now,” generate the reflection from the answers they gave during onboarding instead, starting the moment they tap it. |  |
| N15.08 | [ ] | 33 | Change | If the user picked two reflection tones in onboarding, the first reflection blends both, the same way regular reflections work now. |  |
| N15.09 | [ ] | 33 | Change | This applies whether it’s written from their entry or from their onboarding answers. |  |
| N15.10 | [ ] | 33 | Change | The entry and reflection must be saved and attached to the user’s account once they sign up, so nothing is lost. |  |
| N15.11 | [ ] | 33 | Change | Progress bar at the top, full. |  |
| N15.12 | [ ] | 33 | Exact text | Header: “[First name], your reflection is waiting” |  |
| N15.13 | [ ] | 33 | Change | in the serif heading font. |  |
| N15.14 | [ ] | 33 | Change | The header should split evenly across two lines (balanced line breaks), so the name never ends up alone on a line, no matter how long it is. |  |
| N15.15 | [ ] | 33 | Change | Reflection card (purple card): |  |
| N15.16 | [ ] | 33 | Change | Small label at the top with the sparkle icon: |  |
| N15.17 | [ ] | 33 | Exact text | If they journaled: “WRITTEN FOR YOU” |  |
| N15.18 | [ ] | 33 | Exact text | If they skipped: “BASED ON YOUR ANSWERS” |  |
| N15.19 | [ ] | 33 | Change | The first sentence of their real reflection, fully readable. |  |
| N15.20 | [ ] | 33 | Change | The rest of the reflection blurred. |  |
| N15.21 | [ ] | 33 | Change | A white pill under it with a lock icon: |  |
| N15.22 | [ ] | 33 | Exact text | “Start your trial to read the rest” |  |
| N15.23 | [ ] | 33 | Change | Three benefits, each with a purple checkmark: |  |
| N15.24 | [ ] | 34 | Exact text | Understand your moods week by week |  |
| N15.25 | [ ] | 34 | Exact text | Reflections written in the tone you chose |  |
| N15.26 | [ ] | 34 | Exact text | Share with the people you trust |  |
| N15.27 | [ ] | 34 | Change | Plan cards, stacked: |  |
| N15.28 | [ ] | 34 | Change | Annual (selected by default) |  |
| N15.29 | [ ] | 34 | Change | Annual: purple border |  |
| N15.30 | [ ] | 34 | Exact text | “Best value · Save 50%” | With store prices (N17), 50% may not hold in every region |
| N15.31 | [ ] | 34 | Change | tag in the top right corner |  |
| N15.32 | [ ] | 34 | Exact text | “5-day free trial” under the name. |  |
| N15.33 | [ ] | 34 | Change | Price on the right | Prices in the mock are example values; real values come from the store (N17). |
| N15.34 | [ ] | 34 | Change | “$29.99/yr” as the main price | Example value; real value from the store (N17). |
| N15.35 | [ ] | 34 | Change | “$59.88” crossed out | Example value; = monthly price × 12 from the store (N17). |
| N15.36 | [ ] | 34 | Change | “$2.50/mo” in smaller text underneath | Example value; = annual price ÷ 12 from the store (N17). |
| N15.37 | [ ] | 34 | Change | $29.99/yr must stay the biggest price on the card, since that’s what users are actually charged (Apple requires this). |  |
| N15.38 | [ ] | 34 | Change | Monthly: gray border |  |
| N15.39 | [ ] | 34 | Exact text | “No free trial” under the name |  |
| N15.40 | [ ] | 34 | Change | “$4.99/mo” on the right. | Example value; real value comes from the store (N17). |
| N15.41 | [ ] | 34 | Change | Tapping a card selects it. |  |
| N15.42 | [ ] | 34 | Change | Trial timeline, in one row: Today (Full access), Day 3 (We remind you), Day 5 (Trial ends). |  |
| N15.43 | [ ] | 34 | Exact text | Today (Full access) | Step title "Today", caption "Full access" |
| N15.44 | [ ] | 34 | Exact text | Day 3 (We remind you) | Step title "Day 3", caption "We remind you" |
| N15.45 | [ ] | 34 | Exact text | Day 5 (Trial ends) | Step title "Day 5", caption "Trial ends" |
| N15.46 | [ ] | 34 | Exact text | Start my 5-day free trial | Trailing comma is sentence punctuation |
| N15.47 | [ ] | 34 | Exact text | with “No charge today. Cancel anytime.” under it |  |
| N15.48 | [ ] | 34 | Exact text | and then “Restore purchases · Terms · Privacy” as links. | Each of the three is a tappable link |
| N15.49 | [ ] | 34 | Exact text | Start monthly plan | Period likely sentence punctuation; label "Start monthly plan" |
| N15.50 | [ ] | 34 | Exact text | Change the text under it to “Cancel anytime.” |  |
| N15.51 | [ ] | 34 | Change | Hide the trial timeline, since there’s no trial on the monthly plan. |  |
| N15.52 | [ ] | 34 | Change | If they journaled: the reflection is attached to their first journal entry, like any other entry, so they can open it from the Journal tab and read the full thing. |  |
| N15.53 | [ ] | 35 | Change | If they skipped: save the answers-based reflection as a “Welcome reflection” card at the top of the Journal tab. |  |
| N15.54 | [ ] | 35 | Exact text | “Welcome reflection” | Card name; unclear if shown as visible title on card |
| N15.55 | [ ] | 35 | Change | Tapping it opens the full reflection. |  |
| N15.56 | [ ] | 35 | Change | The card stays there until the user chooses to delete it. |  |
| N15.57 | [ ] | 35 | Change | It should never disappear on its own. |  |
| N15.58 | [ ] | 35 | Change | Add a small ••• menu on the card with a “Delete” option. |  |
| N15.59 | [ ] | 35 | Change | Before deleting, show a confirmation |  |
| N15.60 | [ ] | 35 | Exact text | Delete your welcome reflection? This can’t be undone. |  |
| N15.61 | [ ] | 35 | Exact text | with “Delete” and “Cancel” buttons. |  |
| N15.62 |  | 35 | Context | This way, “Start your trial to read the rest” is always true. |  |
| N15.63 | [ ] | 35 | Change | Reflection still generating: if the user reaches the paywall before the reflection is ready (for example, after a very fast Sign in with Apple), show “Writing your reflection...” in the card |  |
| N15.64 | [ ] | 35 | Exact text | “Writing your reflection...” |  |
| N15.65 | [ ] | 35 | Change | then show the reflection as soon as it’s ready. |  |
| N15.66 | [ ] | 35 | Change | Reflection fails to load: show “Failed to load” in the card with a “Try again” button. |  |
| N15.67 | [ ] | 35 | Exact text | “Failed to load” |  |
| N15.68 | [ ] | 35 | Exact text | “Try again” |  |
| N15.69 | [ ] | 35 | Change | Tapping it retries generating the reflection inside the card, without restarting the paywall or losing the user’s plan selection. |  |
| N15.70 | [ ] | 35 | Change | Entry triggers the concerning-words check (onboarding): the entry is saved privately with no AI reflection | Overlaps N18 section 7 rules |
| N15.71 | [ ] | 35 | Change | and the crisis resources pop-up shows first. |  |
| N15.72 | [ ] | 35 | Change | After they close it and reach the paywall, the reflection card uses the answers-based reflection, with the “BASED ON YOUR ANSWERS” label. |  |
| N15.73 | [ ] | 35 | Change | The answers-based reflection is also saved as the “Welcome reflection” card at the top of the Journal tab, the same way it works when a user skips the check-in. |  |
| N15.74 | [ ] | 35 | Change | If the user journals on the “Let’s try your first check in” page, that entry counts as day 1 of their streak. |  |
| N15.75 | [ ] | 35 | Change | If they tap “Skip for now,” it doesn’t count, and their streak starts with their first real journal entry in the app. |  |
| N15.76 |  | 36 | Context | Trial eligibility: Apple and Google only give each account one free trial. |  |
| N15.77 | [ ] | 36 | Change | Before showing the paywall, check whether the user is still eligible. | Relies on store intro-offer eligibility and trial configured in stores |
| N15.78 | [ ] | 36 | Change | If they’re not (for example, they deleted the app and signed up again), change the button | Trailing comma is sentence punctuation |
| N15.79 | [ ] | 36 | Exact text | Start annual plan |  |
| N15.80 | [ ] | 36 | Exact text | Cancel anytime. | Elsewhere written "Cancel anytime." with period |
| N15.81 | [ ] | 36 | Change | and hide “5-day free trial” on the Annual card and the trial timeline. |  |
| N15.82 | [ ] | 32 | Change (screenshot) | Main paywall mock: progress bar is a thin, fully filled solid purple bar with no visible gray track. |  |
| N15.83 | [ ] | 32 | Change (screenshot) | Header is left-aligned (not centered), large bold near-black serif on two lines: "Konah, your / reflection is waiting". |  |
| N15.84 | [ ] | 32 | Change (screenshot) | Reflection card is solid deep purple, full content width, with about 20px rounded corners and generous padding. |  |
| N15.85 | [ ] | 32 | Change (screenshot) | Card label is small, uppercase, letter-spaced white text preceded by an outline four-point sparkle icon. |  |
| N15.86 | [ ] | 32 | Change (screenshot) | Readable first sentence is white serif text (regular weight, about 20px) wrapping to two lines; about three heavily blurred white lines follow. |  |
| N15.87 | [ ] | 32 | Change (screenshot) | Pill is white, fully rounded, left-aligned and sized to its content (not full width); lock outline icon and bold text are purple. |  |
| N15.88 | [ ] | 32 | Change (screenshot) | Benefits are a left-aligned list with plain purple stroke checkmarks (no circle background) and dark regular-weight text. |  |
| N15.89 | [ ] | 32 | Change (screenshot) | Main paywall has no "CHOOSE YOUR PLAN" label; plan cards follow the benefits directly. |  |
| N15.90 | [ ] | 32 | Change (screenshot) | Plan cards are white with about 20px rounded corners and a radio on the left: selected is a filled purple circle with white center dot, unselected is an empty gray ring. |  |
| N15.91 | [ ] | 32 | Change (screenshot) | Selected Annual card has a thick (about 2px) purple border; Monthly has a thin light warm-gray border. |  |
| N15.92 | [ ] | 32 | Change (screenshot) | Plan name is bold dark text with the gray trial line below; main price is bold, large and right-aligned; Monthly price is vertically centered. |  |
| N15.93 | [ ] | 32 | Change (screenshot) | Under $29.99/yr, strikethrough "$59.88" and "$2.50/mo" sit on ONE small gray line separated by " · ". |  |
| N15.94 | [ ] | 32 | Change (screenshot) | "Best value · Save 50%" tag is a dark green pill with white bold text, straddling the Annual card's top border at the right. |  |
| N15.95 | [ ] | 32 | Change (screenshot) | Timeline: three nodes on a thin light-purple line; Today is a filled purple dot, Day 3 and Day 5 are hollow purple rings; bold dark titles with gray captions centered under each. |  |
| N15.96 | [ ] | 32 | Change (screenshot) | CTA is a full-width purple pill with white bold text and a soft purple glow shadow, anchored near the bottom. |  |
| N15.97 | [ ] | 32 | Change (screenshot) | "No charge today. Cancel anytime." is centered small gray text; the three links below are purple and underlined, separated by gray middots. |  |
| N15.98 |  | 32 | Context (screenshot) | No close (X) or back control is visible on the main paywall mock. | Mock shows none; confirm intended dismiss behavior |
| N15.99 | [ ] | 34 | Exact text (screenshot) | ✚ Plan card titles read "Annual" and "Monthly" in bold dark text on both the main and Welcome back paywall mocks |  |
| N15.100 | [ ] | 34 | Exact text | ✚ Annual | Plan card name (bold in mock); reused on Welcome back paywall |
| N15.101 | [ ] | 34 | Exact text | ✚ Monthly | Plan card name (bold in mock); reused on Welcome back paywall |

### N16 "Welcome back" paywall for returning users  (39)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N16.01 | [ ] | 37 | Change | It uses the same layout as the main paywall, with these differences: |  |
| N16.02 | [ ] | 37 | Change | No progress bar. |  |
| N16.03 | [ ] | 37 | Exact text | Header: “[First name], welcome back” |  |
| N16.04 | [ ] | 37 | Exact text | Purple card: label “YOUR LAST ENTRY · [DATE]” |  |
| N16.05 | [ ] | 37 | Change | with the sparkle icon. |  |
| N16.06 | [ ] | 37 | Change | The first line of the user’s most recent journal entry is fully readable, the rest is blurred | "First line" ambiguous; mock shows two readable lines (two sentences) |
| N16.07 | [ ] | 37 | Exact text | and the white pill says “Subscribe to open your journal.” | PDF has a period; the mock shows none. Confirm punctuation. |
| N16.08 | [ ] | 37 | Change | Use the most recent entry that wasn’t flagged by the concerning-words check. |  |
| N16.09 | [ ] | 37 | Change | If they have no entries, hide the card. |  |
| N16.10 | [ ] | 37 | Change | Three checkmark lines: |  |
| N16.11 | [ ] | 37 | Exact text | All [number] of your entries, right where you left them |  |
| N16.12 | [ ] | 37 | Exact text | New reflections in the tone you chose |  |
| N16.13 | [ ] | 37 | Exact text | Your circles and the people in them |  |
| N16.14 | [ ] | 37 | Exact text | “CHOOSE YOUR PLAN” label |  |
| N16.15 | [ ] | 37 | Change | between the checkmark lines and the plan cards, in the same gray, spaced-out caps style as the app’s other section labels (like “TODAY’S MOOD”), with a bit of extra space above it. |  |
| N16.16 | [ ] | 37 | Change | Plan cards: same as the main paywall, but “Billed yearly” and “Billed monthly” replace the trial lines. |  |
| N16.17 | [ ] | 37 | Exact text | “Billed yearly” |  |
| N16.18 | [ ] | 37 | Exact text | “Billed monthly” |  |
| N16.19 | [ ] | 37 | Change | No trial timeline. |  |
| N16.20 | [ ] | 37 | Exact text | Button: “Start annual plan” |  |
| N16.21 | [ ] | 37 | Exact text | with “Cancel anytime.” under it |  |
| N16.22 | [ ] | 37 | Exact text | (or “Start monthly plan” when Monthly is selected) |  |
| N16.23 | [ ] | 37 | Exact text | Restore purchases · Terms · Privacy |  |
| N16.24 | [ ] | 37 | Change | If the user is somehow still eligible for the free trial (per section 8), show the trial version of the button, card text, and timeline instead. |  |
| N16.25 | [ ] | 37 | Change | Subscription ended, app still installed: every time the user opens the app without an active subscription, take them straight to the Welcome back paywall. |  |
| N16.26 | [ ] | 38 | Change | If they cancel, they keep full access until the end of the period they already paid for |  |
| N16.27 | [ ] | 38 | Change | and the paywall should only show once that period actually ends. |  |
| N16.28 | [ ] | 38 | Change | App deleted and reinstalled: treat them as a brand-new user, starting at the beginning of onboarding. |  |
| N16.29 | [ ] | 38 | Change | If they tap “Sign in” instead and sign in successfully: No active subscription: take them straight to the Welcome back paywall, then into the app once they subscribe. |  |
| N16.30 | [ ] | 38 | Change | Active subscription: skip the paywall completely and take them straight into the app. |  |
| N16.31 | [ ] | 37 | Change (screenshot) | Welcome back mock: no progress bar; header "Konah, welcome back" fits on one line, left-aligned, bold serif. |  |
| N16.32 | [ ] | 37 | Change (screenshot) | Label date is uppercase abbreviated month and day with no year: "YOUR LAST ENTRY · SEP 30". |  |
| N16.33 | [ ] | 37 | Change (screenshot) | Readable part shows two lines (two sentences) of the entry in white serif; about four heavily blurred lines follow. | PDF says the first line is readable; the mock shows two sentences. Confirm rule. |
| N16.34 | [ ] | 37 | Change (screenshot) | Pill reads "Subscribe to open your journal" with no trailing period; same white pill with purple lock icon and bold purple text. |  |
| N16.35 | [ ] | 37 | Change (screenshot) | Entry count shows as numerals ("All 14 of your entries, right where you left them"), wrapping to two left-aligned lines with purple checkmarks. |  |
| N16.36 | [ ] | 37 | Change (screenshot) | "CHOOSE YOUR PLAN" is gray, letter-spaced uppercase, left-aligned, with extra space above it. |  |
| N16.37 | [ ] | 37 | Change (screenshot) | Plan cards keep the green "Best value · Save 50%" tag, $59.88 strikethrough and $2.50/mo line; "Billed yearly"/"Billed monthly" appear in gray under the names. |  |
| N16.38 | [ ] | 37 | Change (screenshot) | No timeline; empty space between plan cards and the bottom-anchored purple "Start annual plan" pill with glow; "Cancel anytime." and underlined purple links centered below. |  |
| N16.39 |  | 37 | Context (screenshot) | ✚ Welcome back paywall mock has no close (X) or back control | Matches the hard paywall rule in "When it shows". |

### N17 Real store prices and subscription check on open  (6)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N17.01 | [ ] | 36 | Change | Prices from the stores: don’t hardcode any prices. |  |
| N17.02 | [ ] | 36 | Change | Pull them from the App Store and Google Play, so users in other countries see the right price in their own currency. | External: subscription products must exist in both stores. |
| N17.03 | [ ] | 36 | Change | The crossed-out price should be the monthly price times 12 |  |
| N17.04 | [ ] | 36 | Change | and the per-month price should be the annual price divided by 12, both calculated from the store prices. |  |
| N17.05 | [ ] | 38 | Change | Check the subscription status every time the app opens, so this always reflects their current status with the App Store or Google Play. |  |
| N17.06 |  | 11 | Context (screenshot) | ✚ Body copy in the mock shows the trial end date "Sep 29, 2026" and the renewal price "$29.99/year" | If "don't hardcode any prices" applies app-wide, this renewal price must also come from the store. |

### N18 Entries with concerning words: no AI reflection, no sharing  (13)

| # | Done | Page | Type | Requirement | Note |
|---|---|---|---|---|---|
| N18.01 | [ ] | 36 | Change | 7. Entries with concerning words (applies everywhere: onboarding and the app) |  |
| N18.02 | [ ] | 36 | Change | Save the entry privately, like any other entry, so the user never loses what they wrote. |  |
| N18.03 | [ ] | 36 | Change | Show the crisis resources pop-up as soon as the entry is saved. |  |
| N18.04 | [ ] | 36 | Change | Don’t generate an AI reflection for that entry. |  |
| N18.05 | [ ] | 36 | Change | Where the reflection would normally show, show a short message with the crisis resources instead: |  |
| N18.06 | [ ] | 36 | Exact text | You don’t have to carry this alone. Talking to someone can help, right now. | Client wrote it mid-sentence ending in a comma; final punctuation to confirm. |
| N18.07 | [ ] | 36 | Change | followed by the 988 and Crisis Text Line options. |  |
| N18.08 | [ ] | 36 | Change | Block sharing for that entry. |  |
| N18.09 | [ ] | 36 | Change | It can’t be shared to any circle, public or private. |  |
| N18.10 | [ ] | 36 | Exact text | This entry can’t be shared, but support is always available. | Client wrote it mid-sentence ending in a comma; final punctuation to confirm. |
| N18.11 | [ ] | 36 | Change | with a link to the crisis resources. |  |
| N18.12 | [ ] | 36 | Change | Concerning-words check runs first: check every entry for concerning words before it’s sent to OpenAI. |  |
| N18.13 | [ ] | 36 | Change | If it’s flagged, it never gets sent, and the rules in section 7 apply. |  |

## Not mapped to a task

| Page | Requirement | Note |
|---|---|---|
| 3 | ref-onboarding-two-ways-to-open-up.png: onboarding "Two ways to open up." screen with a purple lock "Private" bubble and a green globe "Public" bubble | Screenshot not referenced in the PDF; purpose asked from the client. |

