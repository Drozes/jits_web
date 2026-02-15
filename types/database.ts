export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          looking_for_match: boolean
          primary_gym_id: string | null
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
          looking_for_match?: boolean
          primary_gym_id?: string | null
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
          looking_for_match?: boolean
          primary_gym_id?: string | null
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
          k_factor?: number
          opponent_elo: number
        }
        Returns: Json
      }
      can_create_challenge:
        | { Args: never; Returns: boolean }
        | { Args: { p_opponent_id?: string }; Returns: boolean }
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
      start_match: { Args: { p_match_id: string }; Returns: Json }
      start_match_from_challenge: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
    }
    Enums: {
      match_result_enum: "submission" | "draw"
      match_type_enum: "ranked" | "casual"
      participant_outcome_enum: "win" | "loss" | "draw"
      participant_role_enum: "competitor" | "referee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof Database
}
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      match_result_enum: ["submission", "draw"],
      match_type_enum: ["ranked", "casual"],
      participant_outcome_enum: ["win", "loss", "draw"],
      participant_role_enum: ["competitor", "referee"],
    },
  },
} as const
