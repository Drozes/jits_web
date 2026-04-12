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
      athlete_avatars: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          is_active: boolean
          model_used: string
          prompt_used: string | null
          storage_path: string
          style: string
          video_id: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_used: string
          prompt_used?: string | null
          storage_path: string
          style: string
          video_id?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_used?: string
          prompt_used?: string | null
          storage_path?: string
          style?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_avatars_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_avatars_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          city: string | null
          created_at: string
          current_elo: number
          current_weight: number | null
          date_of_birth: string | null
          default_still_url: string | null
          display_name: string
          free_agent: boolean
          gender: string | null
          highest_elo: number
          id: string
          is_scoutable: boolean
          looking_for_casual: boolean
          looking_for_ranked: boolean
          primary_gym_id: string | null
          profile_photo_url: string | null
          role: Database["public"]["Enums"]["athlete_role"]
          status: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          current_elo?: number
          current_weight?: number | null
          date_of_birth?: string | null
          default_still_url?: string | null
          display_name: string
          free_agent?: boolean
          gender?: string | null
          highest_elo?: number
          id?: string
          is_scoutable?: boolean
          looking_for_casual?: boolean
          looking_for_ranked?: boolean
          primary_gym_id?: string | null
          profile_photo_url?: string | null
          role?: Database["public"]["Enums"]["athlete_role"]
          status?: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          current_elo?: number
          current_weight?: number | null
          date_of_birth?: string | null
          default_still_url?: string | null
          display_name?: string
          free_agent?: boolean
          gender?: string | null
          highest_elo?: number
          id?: string
          is_scoutable?: boolean
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
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      gym_schedules: {
        Row: {
          created_at: string
          created_by: string
          day_of_week: number
          end_time: string
          gym_id: string
          id: string
          is_active: boolean
          notes: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          day_of_week: number
          end_time: string
          gym_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          day_of_week?: number
          end_time?: string
          gym_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_schedules_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
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
      match_confirmations: {
        Row: {
          athlete_id: string
          confirmed: boolean
          created_at: string
          id: string
          match_id: string
        }
        Insert: {
          athlete_id: string
          confirmed?: boolean
          created_at?: string
          id?: string
          match_id: string
        }
        Update: {
          athlete_id?: string
          confirmed?: boolean
          created_at?: string
          id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_confirmations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_confirmations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_disputes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          raised_by: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          raised_by: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          raised_by?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
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
      match_videos: {
        Row: {
          angle_quality: number | null
          athlete_left_id: string | null
          camera_angle: string | null
          created_at: string
          duration_seconds: number | null
          file_size_bytes: number | null
          id: string
          match_id: string
          platform: string
          platform_asset_id: string | null
          playback_url: string | null
          primary_video_id: string | null
          recorded_by: string | null
          recording_type: string | null
          status: string
          storage_path: string | null
          sync_offset_ms: number | null
          thumbnail_url: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          angle_quality?: number | null
          athlete_left_id?: string | null
          camera_angle?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          match_id: string
          platform?: string
          platform_asset_id?: string | null
          playback_url?: string | null
          primary_video_id?: string | null
          recorded_by?: string | null
          recording_type?: string | null
          status?: string
          storage_path?: string | null
          sync_offset_ms?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          angle_quality?: number | null
          athlete_left_id?: string | null
          camera_angle?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          match_id?: string
          platform?: string
          platform_asset_id?: string | null
          playback_url?: string | null
          primary_video_id?: string | null
          recorded_by?: string | null
          recording_type?: string | null
          status?: string
          storage_path?: string | null
          sync_offset_ms?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_videos_athlete_left_id_fkey"
            columns: ["athlete_left_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_videos_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_videos_primary_video_id_fkey"
            columns: ["primary_video_id"]
            isOneToOne: false
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_videos_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_videos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          challenge_id: string | null
          completed_at: string | null
          created_at: string
          duration_seconds: number
          gym_id: string | null
          id: string
          initiated_by_athlete_id: string | null
          match_type: Database["public"]["Enums"]["match_type_enum"]
          paused_at: string | null
          result: Database["public"]["Enums"]["match_result_enum"] | null
          session_id: string | null
          started_at: string | null
          status: string
          timekeeper_id: string | null
          total_paused_duration: number
        }
        Insert: {
          challenge_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          gym_id?: string | null
          id?: string
          initiated_by_athlete_id?: string | null
          match_type: Database["public"]["Enums"]["match_type_enum"]
          paused_at?: string | null
          result?: Database["public"]["Enums"]["match_result_enum"] | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          timekeeper_id?: string | null
          total_paused_duration?: number
        }
        Update: {
          challenge_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          gym_id?: string | null
          id?: string
          initiated_by_athlete_id?: string | null
          match_type?: Database["public"]["Enums"]["match_type_enum"]
          paused_at?: string | null
          result?: Database["public"]["Enums"]["match_result_enum"] | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          timekeeper_id?: string | null
          total_paused_duration?: number
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
          {
            foreignKeyName: "matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_timekeeper_id_fkey"
            columns: ["timekeeper_id"]
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
      session_participants: {
        Row: {
          athlete_id: string
          checked_in_at: string
          checked_out_at: string | null
          current_match_id: string | null
          id: string
          session_id: string
          status: string
          weight_confirmed: number | null
        }
        Insert: {
          athlete_id: string
          checked_in_at?: string
          checked_out_at?: string | null
          current_match_id?: string | null
          id?: string
          session_id: string
          status?: string
          weight_confirmed?: number | null
        }
        Update: {
          athlete_id?: string
          checked_in_at?: string
          checked_out_at?: string | null
          current_match_id?: string | null
          id?: string
          session_id?: string
          status?: string
          weight_confirmed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_current_match_id_fkey"
            columns: ["current_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_rsvps: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          session_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          session_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_rsvps_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_rsvps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          created_by: string
          gym_id: string
          id: string
          max_participants: number | null
          notes: string | null
          scheduled_end: string
          scheduled_start: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          gym_id: string
          id?: string
          max_participants?: number | null
          notes?: string | null
          scheduled_end: string
          scheduled_start: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          gym_id?: string
          id?: string
          max_participants?: number | null
          notes?: string | null
          scheduled_end?: string
          scheduled_start?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
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
      technique_tags: {
        Row: {
          analysis_id: string | null
          athlete_id: string | null
          category: string
          confidence: number | null
          constraints: Json | null
          created_at: string
          id: string
          source: string
          submission_type_id: string | null
          technique_name: string
          timestamp_end: number | null
          timestamp_start: number
          video_id: string
        }
        Insert: {
          analysis_id?: string | null
          athlete_id?: string | null
          category?: string
          confidence?: number | null
          constraints?: Json | null
          created_at?: string
          id?: string
          source?: string
          submission_type_id?: string | null
          technique_name: string
          timestamp_end?: number | null
          timestamp_start: number
          video_id: string
        }
        Update: {
          analysis_id?: string | null
          athlete_id?: string | null
          category?: string
          confidence?: number | null
          constraints?: Json | null
          created_at?: string
          id?: string
          source?: string
          submission_type_id?: string | null
          technique_name?: string
          timestamp_end?: number | null
          timestamp_start?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technique_tags_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "video_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technique_tags_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technique_tags_submission_type_id_fkey"
            columns: ["submission_type_id"]
            isOneToOne: false
            referencedRelation: "submission_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technique_tags_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_analyses: {
        Row: {
          analysis_tier: string
          athlete_stills: Json | null
          biomechanical_timeline: Json | null
          completed_at: string | null
          cost_cents: number | null
          created_at: string
          id: string
          model_used: string
          positions: Json | null
          recommendations: Json | null
          scoring_moments: Json | null
          status: string
          summary: string | null
          tokens_used: number | null
          video_id: string
        }
        Insert: {
          analysis_tier?: string
          athlete_stills?: Json | null
          biomechanical_timeline?: Json | null
          completed_at?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          model_used: string
          positions?: Json | null
          recommendations?: Json | null
          scoring_moments?: Json | null
          status?: string
          summary?: string | null
          tokens_used?: number | null
          video_id: string
        }
        Update: {
          analysis_tier?: string
          athlete_stills?: Json | null
          biomechanical_timeline?: Json | null
          completed_at?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          model_used?: string
          positions?: Json | null
          recommendations?: Json | null
          scoring_moments?: Json | null
          status?: string
          summary?: string | null
          tokens_used?: number | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_analyses_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_acknowledgements: {
        Row: {
          athlete_id: string
          id: string
          session_id: string | null
          signed_at: string
          waiver_id: string
        }
        Insert: {
          athlete_id: string
          id?: string
          session_id?: string | null
          signed_at?: string
          waiver_id: string
        }
        Update: {
          athlete_id?: string
          id?: string
          session_id?: string | null
          signed_at?: string
          waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_acknowledgements_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_acknowledgements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_acknowledgements_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      waivers: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          scope: string
          slug: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          scope?: string
          slug: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          scope?: string
          slug?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
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
      clear_active_avatar: { Args: never; Returns: Json }
      confirm_match_result: { Args: { p_match_id: string }; Returns: Json }
      create_direct_conversation: {
        Args: { p_other_athlete_id: string }
        Returns: Json
      }
      create_session: {
        Args: {
          p_gym_id: string
          p_max_participants?: number
          p_notes?: string
          p_scheduled_end: string
          p_scheduled_start: string
          p_title?: string
        }
        Returns: string
      }
      create_session_match: {
        Args: {
          p_opponent_id: string
          p_session_id: string
          p_timekeeper_id?: string
        }
        Returns: Json
      }
      dispute_match_result: {
        Args: { p_match_id: string; p_reason?: string }
        Returns: Json
      }
      end_match: { Args: { p_match_id: string }; Returns: Json }
      expire_pending_challenges: { Args: never; Returns: number }
      get_arena_data: { Args: { p_limit?: number }; Returns: Json }
      get_athlete_avatars: { Args: { p_athlete_id: string }; Returns: Json }
      get_athlete_profile_stills: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
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
      get_athlete_videos: {
        Args: { p_athlete_id: string; p_limit?: number }
        Returns: Json
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
      get_match_details: { Args: { p_match_id: string }; Returns: Json }
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
      get_match_videos: { Args: { p_match_id: string }; Returns: Json }
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
      get_scouting_matchup: { Args: { p_opponent_id: string }; Returns: Json }
      get_scouting_report: { Args: { p_opponent_id: string }; Returns: Json }
      get_session_lobby: { Args: { p_session_id: string }; Returns: Json }
      get_unread_counts: {
        Args: never
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
      get_video_analysis: { Args: { p_video_id: string }; Returns: Json }
      get_weight_division: { Args: { p_weight: number }; Returns: number }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_match_video_participant: {
        Args: { p_video_id: string }
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
      pause_match: { Args: { p_match_id: string }; Returns: Json }
      random_match: { Args: { p_session_id: string }; Returns: Json }
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
      resume_match: { Args: { p_match_id: string }; Returns: Json }
      set_active_avatar: { Args: { p_avatar_id: string }; Returns: Json }
      set_athlete_role: {
        Args: {
          p_athlete_id: string
          p_role: Database["public"]["Enums"]["athlete_role"]
        }
        Returns: undefined
      }
      set_default_still: { Args: { p_still_url: string }; Returns: string }
      start_match: { Args: { p_match_id: string }; Returns: Json }
      start_match_from_challenge: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
      toggle_scoutable: { Args: { p_scoutable: boolean }; Returns: boolean }
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

