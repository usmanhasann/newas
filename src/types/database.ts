/**
 * Typed Supabase schema (Phase 1 tables). Hand-authored to mirror supabase/migrations.
 * Regenerate from the live DB with:
 *   supabase gen types typescript --project-id <id> --schema public > src/types/database.ts
 * Keep in sync with the migrations until generation is wired into CI.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AiStatus = 'idle' | 'pending' | 'ready' | 'failed';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'
  | 'expired'
  | 'inactive';
export type SubscriptionPlan = 'monthly' | 'yearly';
/** The store a subscription was purchased through (in-app purchases). */
export type PurchasePlatform = 'ios' | 'android';
export type DevicePlatform = 'ios' | 'android' | 'web';
export type CrisisSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CircleType = 'public' | 'private';
/** Per-circle tone for AI text shared into a circle (personalization Phase 2). 'personal' =
 *  each shared message uses its author's own personal_reflection_style. */
export type CircleReflectionStyle = 'gentle' | 'direct' | 'encouraging' | 'reflective' | 'personal';
export type MemberStatus = 'invited' | 'requested' | 'approved' | 'rejected' | 'left';
export type MemberRole = 'owner' | 'member';
export type EmailInviteStatus = 'pending' | 'accepted' | 'revoked';
export type ReflectionType = 'weekly' | 'monthly' | 'yearly';
export type ReflectionGenStatus = 'pending' | 'ready' | 'failed';
/** Per-user tone for the private weekly/monthly/yearly reflections (personalization Phase 1). */
export type PersonalReflectionStyle = 'gentle' | 'direct' | 'encouraging' | 'reflective';
/** Trust & Safety (moderation) — client-facing enums. */
export type UserBlockType = 'block' | 'mute';
export type ModerationReportStatus = 'pending' | 'reviewing' | 'actioned' | 'dismissed';
export type ModerationAppealStatus = 'pending' | 'upheld' | 'denied';
export type CircleStanding = 'ok' | 'restricted' | 'suspended';

type Timestamps = { created_at: string; updated_at: string };

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          timezone: string;
          onboarding_completed: boolean;
          settings: Json;
          active_moods: string[];
          first_entry_date: string | null;
          personal_reflection_style: PersonalReflectionStyle;
          /** Optional second reflection tone; when set, the AI blends it with the primary. */
          personal_reflection_style_secondary: PersonalReflectionStyle | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          timezone?: string;
          onboarding_completed?: boolean;
          settings?: Json;
          active_moods?: string[];
          first_entry_date?: string | null;
          personal_reflection_style?: PersonalReflectionStyle;
          personal_reflection_style_secondary?: PersonalReflectionStyle | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      email_verifications: {
        Row: {
          user_id: string;
          verified: boolean;
          verified_at: string | null;
          token: string | null;
          token_expires_at: string | null;
          last_sent_at: string | null;
        } & Timestamps;
        Insert: {
          user_id: string;
          verified?: boolean;
          verified_at?: string | null;
          token?: string | null;
          token_expires_at?: string | null;
          last_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['email_verifications']['Insert']>;
        Relationships: [];
      };
      moods: {
        Row: {
          id: string;
          slug: string;
          label: string;
          emoji: string;
          icon: string | null;
          color: string;
          sort_order: number;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          slug: string;
          label: string;
          emoji: string;
          icon?: string | null;
          color: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['moods']['Insert']>;
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          /** Primary mood — always mirrors mood_slugs[0] (trigger-maintained). */
          mood_slug: string;
          /** Up to 3 distinct moods for this entry (spec §1.2). */
          mood_slugs: string[];
          note: string | null;
          ai_summary: string | null;
          ai_status: AiStatus;
          ai_error: string | null;
          shared: boolean;
          /**
           * Set by the database on every save: the note has a crisis keyword (client 10/14 p.36). Such an
           * entry gets no AI reflection and can’t be shared; the app can’t set or clear it.
           */
          crisis_flagged: boolean;
          local_date: string;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          /** Optional on write — the normalize trigger derives it from mood_slugs[0]. */
          mood_slug?: string;
          mood_slugs?: string[];
          note?: string | null;
          ai_summary?: string | null;
          ai_status?: AiStatus;
          ai_error?: string | null;
          shared?: boolean;
          crisis_flagged?: boolean;
          local_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['journal_entries']['Insert']>;
        Relationships: [];
      };
      reflections: {
        Row: {
          id: string;
          user_id: string;
          type: ReflectionType;
          period_start: string;
          period_end: string;
          status: ReflectionGenStatus;
          content: string | null;
          entry_count: number;
          source_entry_ids: string[];
          source_version: number;
          model: string | null;
          prompt_version: number;
          error: string | null;
          generated_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          type: ReflectionType;
          period_start: string;
          period_end: string;
          status?: ReflectionGenStatus;
          content?: string | null;
          entry_count?: number;
          source_entry_ids?: string[];
          source_version?: number;
          model?: string | null;
          prompt_version?: number;
          error?: string | null;
          generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reflections']['Insert']>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: SubscriptionPlan | null;
          status: SubscriptionStatus;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          environment: string;
          trial_started_at: string | null;
          trial_ends_at: string | null;
          trial_consumed: boolean;
          // Platform-independent in-app-purchase entitlement (App Store / Play).
          platform: PurchasePlatform | null;
          product_id: string | null;
          store_transaction_id: string | null;
          store_environment: string;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          plan?: SubscriptionPlan | null;
          status?: SubscriptionStatus;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          environment?: string;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          trial_consumed?: boolean;
          platform?: PurchasePlatform | null;
          product_id?: string | null;
          store_transaction_id?: string | null;
          store_environment?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
        Relationships: [];
      };
      device_tokens: {
        Row: {
          id: string;
          user_id: string;
          platform: DevicePlatform;
          token: string;
          enabled: boolean;
          last_seen_at: string;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          platform: DevicePlatform;
          token: string;
          enabled?: boolean;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['device_tokens']['Insert']>;
        Relationships: [];
      };
      notification_prefs: {
        // daily_inspiration / weekly_progress / circle_activity are retired (kept in the DB only
        // for app builds already installed) — nothing reads them any more.
        Row: {
          id: string;
          user_id: string;
          journaling_reminder: boolean;
          streak_reminder: boolean;
          weekly_recap: boolean;
          monthly_recap: boolean;
          yearly_recap: boolean;
          daily_inspiration: boolean;
          weekly_progress: boolean;
          circle_activity: boolean;
          reminder_time: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          journaling_reminder?: boolean;
          streak_reminder?: boolean;
          weekly_recap?: boolean;
          monthly_recap?: boolean;
          yearly_recap?: boolean;
          daily_inspiration?: boolean;
          weekly_progress?: boolean;
          circle_activity?: boolean;
          reminder_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notification_prefs']['Insert']>;
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string | null;
          message: string;
          category: string | null;
          app_version: string | null;
          platform: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          message: string;
          category?: string | null;
          app_version?: string | null;
          platform?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['feedback']['Insert']>;
        Relationships: [];
      };
      crisis_keywords: {
        Row: {
          id: string;
          phrase: string;
          match_type: 'contains' | 'word' | 'regex';
          severity: CrisisSeverity;
          title: string;
          message: string;
          resource_name: string;
          resource_phone: string;
          resource_sms: string | null;
          resource_url: string | null;
          region: string;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          phrase: string;
          match_type?: 'contains' | 'word' | 'regex';
          severity?: CrisisSeverity;
          title: string;
          message: string;
          resource_name: string;
          resource_phone: string;
          resource_sms?: string | null;
          resource_url?: string | null;
          region?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['crisis_keywords']['Insert']>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          target_user_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          target_user_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>;
        Relationships: [];
      };
      circles: {
        Row: {
          id: string;
          owner_id: string | null; // set-null on owner account deletion → Circle archives
          name: string;
          type: CircleType;
          invite_code: string;
          invite_link_slug: string | null;
          circle_reflection_style: CircleReflectionStyle;
          description: string | null;
          member_count: number;
          archived_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          type?: CircleType;
          invite_code?: string;
          invite_link_slug?: string | null;
          circle_reflection_style?: CircleReflectionStyle;
          description?: string | null;
          member_count?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['circles']['Insert']>;
        Relationships: [];
      };
      circle_members: {
        Row: {
          id: string;
          circle_id: string;
          user_id: string;
          role: MemberRole;
          status: MemberStatus;
          /** When they became an approved member (null while requested / after leaving). */
          approved_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          circle_id: string;
          user_id: string;
          role?: MemberRole;
          status?: MemberStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['circle_members']['Insert']>;
        Relationships: [];
      };
      circle_email_invites: {
        Row: {
          id: string;
          circle_id: string;
          email: string;
          invited_by: string | null;
          status: EmailInviteStatus;
          invitee_name: string | null;
          can_see_mood: boolean;
          can_see_summary: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          circle_id: string;
          email: string;
          invited_by?: string | null;
          status?: EmailInviteStatus;
          invitee_name?: string | null;
          can_see_mood?: boolean;
          can_see_summary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['circle_email_invites']['Insert']>;
        Relationships: [];
      };
      entry_shares: {
        Row: {
          id: string;
          entry_id: string;
          circle_id: string | null;
          target_user_id: string | null;
          created_at: string;
          /** Per-circle TONED copy of the entry's AI message (service-role written). */
          ai_summary: string | null;
          ai_status: AiStatus;
          ai_error: string | null;
        };
        Insert: {
          id?: string;
          entry_id: string;
          circle_id?: string | null;
          target_user_id?: string | null;
          created_at?: string;
          ai_summary?: string | null;
          ai_status?: AiStatus;
          ai_error?: string | null;
        };
        Update: Partial<Database['public']['Tables']['entry_shares']['Insert']>;
        Relationships: [];
      };
      share_views: {
        Row: { id: string; entry_id: string; viewer_id: string; viewed_at: string };
        Insert: { id?: string; entry_id: string; viewer_id: string; viewed_at?: string };
        Update: Partial<Database['public']['Tables']['share_views']['Insert']>;
        Relationships: [];
      };
      reactions: {
        Row: {
          id: string;
          entry_id: string;
          user_id: string;
          reaction: string;
        } & Timestamps;
        Insert: {
          id?: string;
          entry_id: string;
          user_id: string;
          reaction: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reactions']['Insert']>;
        Relationships: [];
      };
      sharing_permissions: {
        Row: {
          id: string;
          owner_id: string;
          target_user_id: string;
          can_see_mood: boolean;
          can_see_summary: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          owner_id: string;
          target_user_id: string;
          can_see_mood?: boolean;
          can_see_summary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sharing_permissions']['Insert']>;
        Relationships: [];
      };
      circle_posts: {
        Row: {
          id: string;
          circle_id: string;
          author_id: string | null;
          parent_id: string | null;
          /** The text. For a shared entry: the version its author picked; null until it exists
           *  (a reflection that isn't ready yet, which only its author can see). */
          body: string | null;
          reply_count: number;
          like_count: number;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          deleted_reason: string | null;
          /** Set when this post is a shared journal entry (Private circles only). */
          entry_id: string | null;
          entry_version: EntryShareVersion | null;
          /** Optional moods on a post/reply; a shared entry carries its entry's moods. */
          mood_slugs: string[];
          /** A reply that answers someone's reply inside a group: that reply, and its author ("@"). */
          reply_to_id: string | null;
          mention_user_id: string | null;
          /** When the thread's top post was made (Private circles show members newer threads only). */
          thread_created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          author_id?: string | null;
          parent_id?: string | null;
          body?: string | null;
          reply_count?: number;
          like_count?: number;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deleted_reason?: string | null;
          entry_id?: string | null;
          entry_version?: EntryShareVersion | null;
          mood_slugs?: string[];
        };
        Update: Partial<Database['public']['Tables']['circle_posts']['Insert']>;
        Relationships: [];
      };
      post_reactions: {
        Row: { id: string; post_id: string; user_id: string; created_at: string };
        Insert: { id?: string; post_id: string; user_id: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['post_reactions']['Insert']>;
        Relationships: [];
      };
      circle_bans: {
        Row: {
          id: string;
          circle_id: string;
          user_id: string;
          banned_by: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          user_id: string;
          banned_by?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['circle_bans']['Insert']>;
        Relationships: [];
      };
      // Retired (replaced by circle_notification_prefs.new_posts); kept for installed builds.
      circle_post_mutes: {
        Row: { user_id: string; circle_id: string; created_at: string };
        Insert: { user_id: string; circle_id: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['circle_post_mutes']['Insert']>;
        Relationships: [];
      };
      // Every day the user journaled, recorded on the day's first entry and never removed by a
      // delete (streaks never drop). Read-only for clients.
      journal_days: {
        Row: { user_id: string; local_date: string; first_entry_id: string; created_at: string };
        Insert: { user_id: string; local_date: string; first_entry_id: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['journal_days']['Insert']>;
        Relationships: [];
      };
      // Each circle's own notification switches, per person. No row = every switch ON.
      circle_notification_prefs: {
        Row: {
          user_id: string;
          circle_id: string;
          replies: boolean;
          reactions: boolean;
          new_prompts: boolean;
          new_posts: boolean;
          new_entries: boolean;
          join_requests: boolean;
        } & Timestamps;
        Insert: {
          user_id: string;
          circle_id: string;
          replies?: boolean;
          reactions?: boolean;
          new_prompts?: boolean;
          new_posts?: boolean;
          new_entries?: boolean;
          join_requests?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['circle_notification_prefs']['Insert']>;
        Relationships: [];
      };
      user_blocks: {
        Row: {
          id: string;
          blocker_id: string;
          target_id: string;
          type: UserBlockType;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocker_id: string;
          target_id: string;
          type?: UserBlockType;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_blocks']['Insert']>;
        Relationships: [];
      };
      circle_reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string | null;
          target_type: string;
          target_id: string | null;
          reason: string | null;
          status: ModerationReportStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          reporter_id: string;
          reported_user_id?: string | null;
          target_type: string;
          target_id?: string | null;
          reason?: string | null;
          status?: ModerationReportStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['circle_reports']['Insert']>;
        Relationships: [];
      };
      moderation_appeals: {
        Row: {
          id: string;
          user_id: string;
          strike_id: string | null;
          suspension_id: string | null;
          message: string | null;
          status: ModerationAppealStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          strike_id?: string | null;
          suspension_id?: string | null;
          message?: string | null;
          status?: ModerationAppealStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['moderation_appeals']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      my_circle_standing: {
        Args: Record<string, never>;
        Returns: string;
      };
      /** Sign-in & Security: the caller's own email, password yes/no and sign-in methods (oldest first). */
      my_sign_in_methods: {
        Args: Record<string, never>;
        Returns: { email: string | null; has_password: boolean; providers: string[] } | null;
      };
      has_active_subscription: {
        Args: { uid?: string; p_environment?: string };
        Returns: boolean;
      };
      /** The in-app notifications list (client 10/14 p.8, p.24): the caller's rows, newest first. */
      my_notifications: {
        Args: {
          p_before_created?: string | null;
          p_before_id?: string | null;
          p_limit?: number;
        };
        Returns: {
          id: string;
          kind: string;
          title: string;
          body: string;
          data: Json;
          created_at: string;
          read_at: string | null;
          actor_name: string | null;
          actor_avatar_url: string | null;
          actor_verified: boolean;
          preview: string | null;
        }[];
      };
      /** The bell's dot: anything unread in the notifications list. */
      has_unread_notifications: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      /** Opening the notifications list marks everything read; returns how many. */
      mark_notifications_read: {
        Args: Record<string, never>;
        Returns: number;
      };
      start_trial: {
        Args: { p_environment?: string };
        Returns: Database['public']['Tables']['subscriptions']['Row'];
      };
      set_onboarding: {
        Args: { p_patch: Json };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      resolve_acquisition_prompt: {
        Args: { p_source?: string | null };
        Returns: undefined;
      };
      get_journal_stats: {
        Args: { today_local: string };
        Returns: {
          entries_count: number;
          current_streak: number;
          longest_streak: number;
          last_entry_date: string | null;
          /** Separate local calendar days with an entry. Optional until the
           *  20260812090000 migration is applied (older deploys omit it). */
          distinct_days?: number | null;
        }[];
      };
      /** The caller's longest streak before the run that includes end_date (0 if none). */
      get_previous_longest_streak: {
        Args: { end_date: string };
        Returns: number;
      };
      get_mood_breakdown: {
        Args: { start_date: string; end_date: string };
        Returns: { mood_slug: string; count: number }[];
      };
      get_entry_day_number: {
        Args: { p_entry_id: string };
        Returns: number | null;
      };
      redeem_invite_code: {
        Args: { code: string };
        Returns: { circle_id: string; status: MemberStatus; name: string } | null;
      };
      get_circle_feed: {
        Args: { cid: string; before?: string | null; lim?: number };
        Returns: {
          entry_id: string;
          author_id: string;
          mood_slug: string;
          ai_summary: string | null;
          shared: boolean;
          created_at: string;
        }[];
      };
      get_shared_entry: {
        /** `cid` = the circle it's viewed from; selects that circle's toned copy (null → base). */
        Args: { eid: string; cid?: string | null };
        Returns: {
          entry_id: string;
          author_id: string;
          mood_slug: string;
          ai_summary: string | null;
          shared: boolean;
          created_at: string;
        }[];
      };
      // Replaced by widget_feed; kept for installed app builds that still call it.
      get_circle_member_moods: {
        Args: { cid: string };
        Returns: { user_id: string; mood_slug: string; created_at: string }[];
      };
      /** Share the caller's entry into exactly these Private circles, showing this version. */
      share_entry: {
        Args: { p_entry: string; p_circles: string[]; p_version: EntryShareVersion };
        Returns: { circle_id: string; post_id: string }[];
      };
      /** How many replies (all levels) go with a post: the number a delete confirmation shows. */
      circle_post_reply_total: {
        Args: { p_post: string };
        Returns: number;
      };
      /** Where the caller's entry is shared (author only, including circles they've left). */
      get_entry_shares: {
        Args: { p_entry: string };
        Returns: {
          post_id: string;
          circle_id: string;
          circle_name: string;
          entry_version: EntryShareVersion;
          reply_total: number;
        }[];
      };
      /** Mood Breakdown: per card type, the newest ENDED period, and whether it has entries. */
      get_breakdown_periods: {
        Args: { p_today: string };
        Returns: { type: ReflectionType; period_start: string; period_end: string; has_entries: boolean }[];
      };
      /** Owner deletes a circle and everything in it (Public: only under 5 members). */
      delete_circle: {
        Args: { p_circle: string };
        Returns: undefined;
      };
      /** Revokes one of the caller's widget keys (signing out on that phone). */
      revoke_widget_key: {
        Args: { p_key: string };
        Returns: undefined;
      };
      /** Mints this install's read-only widget key (returns the secret once). */
      create_widget_key: {
        Args: Record<string, never>;
        Returns: string;
      };
      /** The home-screen widget's data for one Private circle (see widget/api.ts WidgetFeed). */
      widget_feed: {
        Args: { p_key: string; p_circle: string };
        Returns: Json;
      };
      reflection_next_unlock: {
        Args: { p_type: ReflectionType; p_today: string };
        Returns: string;
      };
      reflection_yearly_unlock: {
        Args: { p_first: string | null; p_today: string };
        Returns: string | null;
      };
      get_due_reflection_periods: {
        Args: { p_today: string; p_user?: string };
        Returns: {
          type: ReflectionType;
          period_start: string;
          period_end: string;
          entry_count: number;
        }[];
      };
      get_reflections_overview: {
        Args: { p_today: string };
        Returns: {
          type: ReflectionType;
          has_any_entry: boolean;
          next_unlock_date: string;
          content: string | null;
          period_start: string | null;
          period_end: string | null;
          generated_at: string | null;
          generating: boolean;
          failed: boolean;
          /** The newest ended period has entries (false: empty period; null: none ended yet). */
          period_has_entries: boolean | null;
        }[];
      };
    };
    Enums: {
      ai_status: AiStatus;
      subscription_status: SubscriptionStatus;
      subscription_plan: SubscriptionPlan;
      device_platform: DevicePlatform;
      crisis_severity: CrisisSeverity;
      circle_type: CircleType;
      circle_reflection_style: CircleReflectionStyle;
      member_status: MemberStatus;
      member_role: MemberRole;
      email_invite_status: EmailInviteStatus;
      reflection_type: ReflectionType;
      reflection_gen_status: ReflectionGenStatus;
      personal_reflection_style: PersonalReflectionStyle;
      user_block_type: UserBlockType;
      moderation_report_status: ModerationReportStatus;
      moderation_appeal_status: ModerationAppealStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience row aliases. */
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Mood = Database['public']['Tables']['moods']['Row'];
export type JournalEntry = Database['public']['Tables']['journal_entries']['Row'];
export type Reflection = Database['public']['Tables']['reflections']['Row'];
export type Subscription = Database['public']['Tables']['subscriptions']['Row'];
export type DeviceToken = Database['public']['Tables']['device_tokens']['Row'];
export type NotificationPrefs = Database['public']['Tables']['notification_prefs']['Row'];
export type Feedback = Database['public']['Tables']['feedback']['Row'];
export type CrisisKeyword = Database['public']['Tables']['crisis_keywords']['Row'];
export type AuditLogEntry = Database['public']['Tables']['audit_log']['Row'];
export type Circle = Database['public']['Tables']['circles']['Row'];
export type CircleMember = Database['public']['Tables']['circle_members']['Row'];
export type CircleEmailInvite = Database['public']['Tables']['circle_email_invites']['Row'];
export type EntryShare = Database['public']['Tables']['entry_shares']['Row'];
export type ShareView = Database['public']['Tables']['share_views']['Row'];
export type Reaction = Database['public']['Tables']['reactions']['Row'];
export type SharingPermission = Database['public']['Tables']['sharing_permissions']['Row'];
export type UserBlock = Database['public']['Tables']['user_blocks']['Row'];
export type CircleReport = Database['public']['Tables']['circle_reports']['Row'];
export type ModerationAppeal = Database['public']['Tables']['moderation_appeals']['Row'];
export type CirclePost = Database['public']['Tables']['circle_posts']['Row'];
/** What a shared entry shows its circle: the entry as written, or its AI reflection. */
export type EntryShareVersion = 'written' | 'reflection';
export type PostReaction = Database['public']['Tables']['post_reactions']['Row'];
export type CircleBan = Database['public']['Tables']['circle_bans']['Row'];
