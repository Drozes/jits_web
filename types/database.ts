export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
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
      kv_store_086394d0: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
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
      can_create_challenge: { Args: never; Returns: boolean }
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
  public: {
    Enums: {
      match_result_enum: ["submission", "draw"],
      match_type_enum: ["ranked", "casual"],
      participant_outcome_enum: ["win", "loss", "draw"],
      participant_role_enum: ["competitor", "referee"],
    },
  },
} as const
