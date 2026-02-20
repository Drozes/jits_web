export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      athletes: {
        Row: {
          auth_user_id: string
          created_at: string
          current_elo: number
          current_weight: number | null
          display_name: string
          free_agent: boolean
          highest_elo: number
          id: string
          looking_for_casual: boolean
          looking_for_ranked: boolean
          primary_gym_id: string | null
          profile_photo_url: string | null
          role: Database["public"]["Enums"]["athlete_role"]
          status: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          current_elo?: number
          current_weight?: number | null
          display_name: string
          free_agent?: boolean
          highest_elo?: number
          id?: string
          looking_for_casual?: boolean
          looking_for_ranked?: boolean
          primary_gym_id?: string | null
          profile_photo_url?: string | null
          role?: Database["public"]["Enums"]["athlete_role"]
          status?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          current_elo?: number
          current_weight?: number | null
          display_name?: string
          free_agent?: boolean
          highest_elo?: number
          id?: string
          looking_for_casual?: boolean
          looking_for_ranked?: boolean
          primary_gym_id?: string | null
          profile_photo_url?: string | null
          role?: Database["public"]["Enums"]["athlete_role"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_athletes_primary_gym"
            columns: ["primary_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          challenger_id: string
          challenger_weight: number | null
          created_at: string
          expires_at: string
          expiry_notified_at: string | null
          id: string
          match_type: Database["public"]["Enums"]["match_type_enum"]
          opponent_id: string
          opponent_weight: number | null
          proposed_gym_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          challenger_id: string
          challenger_weight?: number | null
          created_at?: string
          expires_at?: string
          expiry_notified_at?: string | null
          id?: string
          match_type: Database["public"]["Enums"]["match_type_enum"]
          opponent_id: string
          opponent_weight?: number | null
          proposed_gym_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          challenger_id?: string
          challenger_weight?: number | null
          created_at?: string
          expires_at?: string
          expiry_notified_at?: string | null
          id?: string
          match_type?: Database["public"]["Enums"]["match_type_enum"]
          opponent_id?: string
          opponent_weight?: number | null
          proposed_gym_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_challenges_challenger"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_challenges_gym"
            columns: ["proposed_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_challenges_opponent"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          athlete_id: string
          conversation_id: string
          joined_at: string
          last_read_at: string
        }
        Insert: {
          athlete_id: string
          conversation_id: string
          joined_at?: string
          last_read_at?: string
        }
        Update: {
          athlete_id?: string
          conversation_id?: string
          joined_at?: string
          last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_cp_athlete"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cp_conversation"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          gym_id: string | null
          id: string
          type: Database["public"]["Enums"]["conversation_type_enum"]
        }
        Insert: {
          created_at?: string
          gym_id?: string | null
          id?: string
          type: Database["public"]["Enums"]["conversation_type_enum"]
        }
        Update: {
          created_at?: string
          gym_id?: string | null
          id?: string
          type?: Database["public"]["Enums"]["conversation_type_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_conversations_gym"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      elo_history: {
        Row: {
          athlete_id: string
          created_at: string
          delta: number
          id: string
          match_id: string
          rating_after: number
          rating_before: number
        }
        Insert: {
          athlete_id: string
          created_at?: string
          delta: number
          id?: string
          match_id: string
          rating_after: number
          rating_before: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          delta?: number
          id?: string
          match_id?: string
          rating_after?: number
          rating_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_elo_history_athlete"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_elo_history_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_verified: boolean
          latitude: number | null
          longitude: number | null
          name: string
          region: string | null
          status: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          region?: string | null
          status?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          region?: string | null
          status?: string
        }
        Relationships: []
      }
      match_participants: {
        Row: {
          athlete_id: string
          elo_after: number | null
          elo_before: number | null
          elo_delta: number
          id: string
          match_id: string
          outcome:
            | Database["public"]["Enums"]["participant_outcome_enum"]
            | null
          role: Database["public"]["Enums"]["participant_role_enum"]
          status: string
          weight_division_gap: number | null
        }
        Insert: {
          athlete_id: string
          elo_after?: number | null
          elo_before?: number | null
          elo_delta?: number
          id?: string
          match_id: string
          outcome?:
            | Database["public"]["Enums"]["participant_outcome_enum"]
            | null
          role?: Database["public"]["Enums"]["participant_role_enum"]
          status?: string
          weight_division_gap?: number | null
        }
        Update: {
          athlete_id?: string
          elo_after?: number | null
          elo_before?: number | null
          elo_delta?: number
          id?: string
          match_id?: string
          outcome?:
            | Database["public"]["Enums"]["participant_outcome_enum"]
            | null
          role?: Database["public"]["Enums"]["participant_role_enum"]
          status?: string
          weight_division_gap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_participants_athlete"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_participants_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string
          duration_seconds: number
          gym_id: string | null
          id: string
          initiated_by_athlete_id: string | null
          match_type: Database["public"]["Enums"]["match_type_enum"]
          result: Database["public"]["Enums"]["match_result_enum"] | null
          started_at: string | null
          status: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          gym_id?: string | null
          id?: string
          initiated_by_athlete_id?: string | null
          match_type: Database["public"]["Enums"]["match_type_enum"]
          result?: Database["public"]["Enums"]["match_result_enum"] | null
          started_at?: string | null
          status?: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          gym_id?: string | null
          id?: string
          initiated_by_athlete_id?: string | null
          match_type?: Database["public"]["Enums"]["match_type_enum"]
          result?: Database["public"]["Enums"]["match_result_enum"] | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_matches_challenge"
            columns: ["challenge_id"]
            isOneToOne: true
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_matches_gym"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_matches_initiator"
            columns: ["initiated_by_athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          message_type: Database["public"]["Enums"]["message_type_enum"]
          sender_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type_enum"]
          sender_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type_enum"]
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_messages_conversation"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_messages_sender"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          athlete_id: string
          enable_challenges: boolean
          enable_chat: boolean
          enable_matches: boolean
          updated_at: string
        }
        Insert: {
          athlete_id: string
          enable_challenges?: boolean
          enable_chat?: boolean
          enable_matches?: boolean
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          enable_challenges?: boolean
          enable_chat?: boolean
          enable_matches?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          athlete_id: string
          created_at: string
          device_label: string | null
          id: string
          last_used_at: string
          platform: string
          token: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          device_label?: string | null
          id?: string
          last_used_at?: string
          platform: string
          token: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          device_label?: string | null
          id?: string
          last_used_at?: string
          platform?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_types: {
        Row: {
          category: string
          code: string
          display_name: string
          id: string
          sort_order: number
          status: string
        }
        Insert: {
          category: string
          code: string
          display_name: string
          id?: string
          sort_order?: number
          status?: string
        }
        Update: {
          category?: string
          code?: string
          display_name?: string
          id?: string
          sort_order?: number
          status?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          created_at: string
          finish_time_seconds: number
          id: string
          loser_id: string
          match_id: string
          submission_type_id: string
          winner_id: string
        }
        Insert: {
          created_at?: string
          finish_time_seconds: number
          id?: string
          loser_id: string
          match_id: string
          submission_type_id: string
          winner_id: string
        }
        Update: {
          created_at?: string
          finish_time_seconds?: number
          id?: string
          loser_id?: string
          match_id?: string
          submission_type_id?: string
          winner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_submissions_loser"
            columns: ["loser_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_submissions_match"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_submissions_type"
            columns: ["submission_type_id"]
            isOneToOne: false
            referencedRelation: "submission_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_submissions_winner"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_athlete_id: { Args: never; Returns: string }
      calculate_elo_stakes: {
        Args: {
          challenger_elo: number
          challenger_weight?: number
          k_factor?: number
          opponent_elo: number
          opponent_weight?: number
        }
        Returns: Json
      }
      can_create_challenge:
        | { Args: never; Returns: boolean }
        | { Args: { p_opponent_id?: string }; Returns: boolean }
      create_direct_conversation: {
        Args: { p_other_athlete_id: string }
        Returns: Json
      }
      get_arena_data: { Args: { p_limit?: number }; Returns: Json }
      get_athlete_stats: {
        Args: { p_athlete_id: string }
        Returns: {
          best_win_streak: number
          draws: number
          losses: number
          total_matches: number
          win_streak: number
          wins: number
        }[]
      }
      get_athletes_stats: {
        Args: { p_athlete_ids: string[] }
        Returns: {
          athlete_id: string
          draws: number
          losses: number
          total_matches: number
          wins: number
        }[]
      }
      get_conversations: {
        Args: never
        Returns: {
          conversation_id: string
          conversation_type: Database["public"]["Enums"]["conversation_type_enum"]
          gym_id: string
          gym_name: string
          last_message_body: string
          last_message_created_at: string
          last_message_sender_id: string
          last_message_type: Database["public"]["Enums"]["message_type_enum"]
          other_athlete_display_name: string
          other_athlete_id: string
          other_athlete_profile_photo_url: string
          unread_count: number
        }[]
      }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_elo_history: {
        Args: { p_athlete_id: string }
        Returns: {
          created_at: string
          delta: number
          match_id: string
          rating_after: number
          rating_before: number
        }[]
      }
      get_match_history: {
        Args: { p_athlete_id: string }
        Returns: {
          athlete_outcome: Database["public"]["Enums"]["participant_outcome_enum"]
          completed_at: string
          elo_after: number
          elo_before: number
          elo_delta: number
          finish_time_seconds: number
          match_id: string
          match_type: Database["public"]["Enums"]["match_type_enum"]
          opponent_display_name: string
          opponent_elo_at_time: number
          opponent_id: string
          result: Database["public"]["Enums"]["match_result_enum"]
          submission_type_code: string
          submission_type_display_name: string
        }[]
      }
      get_recent_activity: {
        Args: { p_limit?: number }
        Returns: {
          completed_at: string
          loser_name: string
          match_id: string
          match_type: string
          result: string
          winner_name: string
        }[]
      }
      get_unread_counts: {
        Args: never
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
      get_weight_division: { Args: { p_weight: number }; Returns: number }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      opponent_accepts_match_type: {
        Args: {
          p_match_type: Database["public"]["Enums"]["match_type_enum"]
          p_opponent_id: string
        }
        Returns: boolean
      }
      record_match_result: {
        Args: {
          p_finish_time_seconds?: number
          p_match_id: string
          p_result: string
          p_submission_type_code?: string
          p_winner_id?: string
        }
        Returns: Json
      }
      set_athlete_role: {
        Args: {
          p_athlete_id: string
          p_role: Database["public"]["Enums"]["athlete_role"]
        }
        Returns: undefined
      }
      start_match: { Args: { p_match_id: string }; Returns: Json }
      start_match_from_challenge: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
    }
    Enums: {
      athlete_role: "athlete" | "bot" | "admin"
      conversation_type_enum: "direct" | "gym"
      match_result_enum: "submission" | "draw"
      match_type_enum: "ranked" | "casual"
      message_type_enum: "user" | "system"
      participant_outcome_enum: "win" | "loss" | "draw"
      participant_role_enum: "competitor" | "referee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      athlete_role: ["athlete", "bot", "admin"],
      conversation_type_enum: ["direct", "gym"],
      match_result_enum: ["submission", "draw"],
      match_type_enum: ["ranked", "casual"],
      message_type_enum: ["user", "system"],
      participant_outcome_enum: ["win", "loss", "draw"],
      participant_role_enum: ["competitor", "referee"],
    },
  },
} as const

