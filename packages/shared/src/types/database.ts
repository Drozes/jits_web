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
      admin_audit: {
        Row: {
          action: string
          actor_athlete_id: string | null
          created_at: string
          id: string
          payload: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_athlete_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_athlete_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_actor_athlete_id_fkey"
            columns: ["actor_athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_cards: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
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
          first_name: string | null
          free_agent: boolean
          gender: string | null
          highest_elo: number
          id: string
          instagram_handle: string | null
          is_bot: boolean
          is_scoutable: boolean
          last_name: string | null
          looking_for_casual: boolean
          looking_for_ranked: boolean
          platform_role: Database["public"]["Enums"]["platform_role"]
          practice_match_completed_at: string | null
          practice_match_offered_at: string | null
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
          first_name?: string | null
          free_agent?: boolean
          gender?: string | null
          highest_elo?: number
          id?: string
          instagram_handle?: string | null
          is_bot?: boolean
          is_scoutable?: boolean
          last_name?: string | null
          looking_for_casual?: boolean
          looking_for_ranked?: boolean
          platform_role?: Database["public"]["Enums"]["platform_role"]
          practice_match_completed_at?: string | null
          practice_match_offered_at?: string | null
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
          first_name?: string | null
          free_agent?: boolean
          gender?: string | null
          highest_elo?: number
          id?: string
          instagram_handle?: string | null
          is_bot?: boolean
          is_scoutable?: boolean
          last_name?: string | null
          looking_for_casual?: boolean
          looking_for_ranked?: boolean
          platform_role?: Database["public"]["Enums"]["platform_role"]
          practice_match_completed_at?: string | null
          practice_match_offered_at?: string | null
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
      founder_allowlist: {
        Row: {
          created_at: string
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      gym_managers: {
        Row: {
          athlete_id: string
          granted_at: string
          granted_by: string | null
          gym_id: string
          id: string
        }
        Insert: {
          athlete_id: string
          granted_at?: string
          granted_by?: string | null
          gym_id: string
          id?: string
        }
        Update: {
          athlete_id?: string
          granted_at?: string
          granted_by?: string | null
          gym_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_managers_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_managers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_managers_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
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
          instagram_handle: string | null
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
          instagram_handle?: string | null
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
          instagram_handle?: string | null
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
      match_video_match_verdicts: {
        Row: {
          analysis_id: string | null
          id: number
          match_detected: boolean | null
          match_id: string
          match_video_id: string | null
          no_match_reason: string | null
          recorded_at: string
          source: string
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          analysis_id?: string | null
          id?: never
          match_detected?: boolean | null
          match_id: string
          match_video_id?: string | null
          no_match_reason?: string | null
          recorded_at?: string
          source: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          analysis_id?: string | null
          id?: never
          match_detected?: boolean | null
          match_id?: string
          match_video_id?: string | null
          no_match_reason?: string | null
          recorded_at?: string
          source?: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_video_match_verdicts_match_video_id_fkey"
            columns: ["match_video_id"]
            isOneToOne: false
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      match_videos: {
        Row: {
          angle_quality: number | null
          athlete_left_id: string | null
          camera_angle: string | null
          chunk_count: number | null
          chunks_completed: number
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          file_size_bytes: number | null
          id: string
          match_detected: boolean | null
          match_id: string
          merge_completed_at: string | null
          merge_started_at: string | null
          normalized_path: string | null
          platform: string
          platform_asset_id: string | null
          playback_url: string | null
          primary_video_id: string | null
          recorded_by: string | null
          recording_type: string | null
          requested_tier: string
          reslice_total: number
          slice_attempts: number
          slice_completed_at: string | null
          slice_started_at: string | null
          status: string
          storage_path: string | null
          sync_offset_ms: number | null
          thumbnail_height: number | null
          thumbnail_url: string | null
          thumbnail_width: number | null
          title: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          angle_quality?: number | null
          athlete_left_id?: string | null
          camera_angle?: string | null
          chunk_count?: number | null
          chunks_completed?: number
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          match_detected?: boolean | null
          match_id: string
          merge_completed_at?: string | null
          merge_started_at?: string | null
          normalized_path?: string | null
          platform?: string
          platform_asset_id?: string | null
          playback_url?: string | null
          primary_video_id?: string | null
          recorded_by?: string | null
          recording_type?: string | null
          requested_tier?: string
          reslice_total?: number
          slice_attempts?: number
          slice_completed_at?: string | null
          slice_started_at?: string | null
          status?: string
          storage_path?: string | null
          sync_offset_ms?: number | null
          thumbnail_height?: number | null
          thumbnail_url?: string | null
          thumbnail_width?: number | null
          title?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          angle_quality?: number | null
          athlete_left_id?: string | null
          camera_angle?: string | null
          chunk_count?: number | null
          chunks_completed?: number
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          match_detected?: boolean | null
          match_id?: string
          merge_completed_at?: string | null
          merge_started_at?: string | null
          normalized_path?: string | null
          platform?: string
          platform_asset_id?: string | null
          playback_url?: string | null
          primary_video_id?: string | null
          recorded_by?: string | null
          recording_type?: string | null
          requested_tier?: string
          reslice_total?: number
          slice_attempts?: number
          slice_completed_at?: string | null
          slice_started_at?: string | null
          status?: string
          storage_path?: string | null
          sync_offset_ms?: number | null
          thumbnail_height?: number | null
          thumbnail_url?: string | null
          thumbnail_width?: number | null
          title?: string | null
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
      match_weight_checks: {
        Row: {
          checker_id: string
          created_at: string
          flag_count: number
          flagged_at: string | null
          match_id: string
          reweighed_at: string | null
          status: string
          subject_id: string
          updated_at: string
          weight_seen: number | null
          withdrawn_at: string | null
        }
        Insert: {
          checker_id: string
          created_at?: string
          flag_count?: number
          flagged_at?: string | null
          match_id: string
          reweighed_at?: string | null
          status?: string
          subject_id: string
          updated_at?: string
          weight_seen?: number | null
          withdrawn_at?: string | null
        }
        Update: {
          checker_id?: string
          created_at?: string
          flag_count?: number
          flagged_at?: string | null
          match_id?: string
          reweighed_at?: string | null
          status?: string
          subject_id?: string
          updated_at?: string
          weight_seen?: number | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_weight_checks_checker_id_fkey"
            columns: ["checker_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_weight_checks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_weight_checks_subject_id_fkey"
            columns: ["subject_id"]
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
          dispute_admin_notes: string | null
          dispute_reason: string | null
          dispute_resolution: string | null
          dispute_resolved_at: string | null
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
          dispute_admin_notes?: string | null
          dispute_reason?: string | null
          dispute_resolution?: string | null
          dispute_resolved_at?: string | null
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
          dispute_admin_notes?: string | null
          dispute_reason?: string | null
          dispute_resolution?: string | null
          dispute_resolved_at?: string | null
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
      session_templates: {
        Row: {
          created_at: string
          created_by: string
          day_of_week: number | null
          duration_minutes: number
          gym_id: string
          id: string
          is_active: boolean
          max_participants: number | null
          notes: string | null
          start_time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          day_of_week?: number | null
          duration_minutes?: number
          gym_id: string
          id?: string
          is_active?: boolean
          max_participants?: number | null
          notes?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          day_of_week?: number | null
          duration_minutes?: number
          gym_id?: string
          id?: string
          is_active?: boolean
          max_participants?: number | null
          notes?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_templates_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
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
            foreignKeyName: "fk_sessions_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sessions_gym"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_orphan_sweep_runs: {
        Row: {
          bucket_id: string
          candidates: number
          claimed_at: string
          error: string | null
          finished_at: string | null
          id: number
          removed: number | null
        }
        Insert: {
          bucket_id: string
          candidates: number
          claimed_at?: string
          error?: string | null
          finished_at?: string | null
          id?: never
          removed?: number | null
        }
        Update: {
          bucket_id?: string
          candidates?: number
          claimed_at?: string
          error?: string | null
          finished_at?: string | null
          id?: never
          removed?: number | null
        }
        Relationships: []
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
          dedup_dropped_count: number | null
          id: string
          match_detected: boolean | null
          merge_strategy: string | null
          model_used: string
          no_match_reason: string | null
          positions: Json | null
          recommendations: Json | null
          scoring_moments: Json | null
          source_chunk_count: number | null
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
          dedup_dropped_count?: number | null
          id?: string
          match_detected?: boolean | null
          merge_strategy?: string | null
          model_used: string
          no_match_reason?: string | null
          positions?: Json | null
          recommendations?: Json | null
          scoring_moments?: Json | null
          source_chunk_count?: number | null
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
          dedup_dropped_count?: number | null
          id?: string
          match_detected?: boolean | null
          merge_strategy?: string | null
          model_used?: string
          no_match_reason?: string | null
          positions?: Json | null
          recommendations?: Json | null
          scoring_moments?: Json | null
          source_chunk_count?: number | null
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
      video_chunk_analyses: {
        Row: {
          analysis_tier: string
          athlete_stills: Json | null
          biomechanical_timeline: Json | null
          chunk_id: string
          completed_at: string | null
          cost_cents: number | null
          created_at: string
          error_message: string | null
          id: string
          key_frames: Json | null
          match_detected: boolean | null
          model_used: string
          no_match_reason: string | null
          positions: Json | null
          recommendations: Json | null
          scoring_moments: Json | null
          status: string
          summary: string | null
          technique_tags: Json | null
          terminal_state: Json | null
          tokens_used: number | null
        }
        Insert: {
          analysis_tier?: string
          athlete_stills?: Json | null
          biomechanical_timeline?: Json | null
          chunk_id: string
          completed_at?: string | null
          cost_cents?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          key_frames?: Json | null
          match_detected?: boolean | null
          model_used: string
          no_match_reason?: string | null
          positions?: Json | null
          recommendations?: Json | null
          scoring_moments?: Json | null
          status?: string
          summary?: string | null
          technique_tags?: Json | null
          terminal_state?: Json | null
          tokens_used?: number | null
        }
        Update: {
          analysis_tier?: string
          athlete_stills?: Json | null
          biomechanical_timeline?: Json | null
          chunk_id?: string
          completed_at?: string | null
          cost_cents?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          key_frames?: Json | null
          match_detected?: boolean | null
          model_used?: string
          no_match_reason?: string | null
          positions?: Json | null
          recommendations?: Json | null
          scoring_moments?: Json | null
          status?: string
          summary?: string | null
          technique_tags?: Json | null
          terminal_state?: Json | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_chunk_analyses_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "video_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      video_chunks: {
        Row: {
          chunks_completed_at: string | null
          created_at: string
          duration_seconds: number | null
          end_s: number
          error_message: string | null
          file_size_bytes: number | null
          id: string
          idx: number
          retry_count: number
          start_s: number
          status: string
          storage_path: string
          updated_at: string
          video_id: string
        }
        Insert: {
          chunks_completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_s: number
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          idx: number
          retry_count?: number
          start_s: number
          status?: string
          storage_path: string
          updated_at?: string
          video_id: string
        }
        Update: {
          chunks_completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_s?: number
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          idx?: number
          retry_count?: number
          start_s?: number
          status?: string
          storage_path?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_chunks_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_highlight_feedback: {
        Row: {
          ai_latency_ms: number | null
          ai_model: string | null
          ai_output: Json | null
          ai_prompt_version: string | null
          athlete_id: string
          change_summary: string | null
          chips: string[]
          created_at: string
          free_text: string | null
          highlight_id: string
          id: string
          identity_side: string | null
          match_video_id: string
          new_segments: Json | null
          outcome: string
          outcome_detail: string | null
          rating: number | null
          regenerate: boolean
          result_render_total: number | null
          segments_snapshot: Json | null
          updated_at: string
          version: number | null
          version_identity_side: string | null
        }
        Insert: {
          ai_latency_ms?: number | null
          ai_model?: string | null
          ai_output?: Json | null
          ai_prompt_version?: string | null
          athlete_id: string
          change_summary?: string | null
          chips?: string[]
          created_at?: string
          free_text?: string | null
          highlight_id: string
          id?: string
          identity_side?: string | null
          match_video_id: string
          new_segments?: Json | null
          outcome: string
          outcome_detail?: string | null
          rating?: number | null
          regenerate?: boolean
          result_render_total?: number | null
          segments_snapshot?: Json | null
          updated_at?: string
          version?: number | null
          version_identity_side?: string | null
        }
        Update: {
          ai_latency_ms?: number | null
          ai_model?: string | null
          ai_output?: Json | null
          ai_prompt_version?: string | null
          athlete_id?: string
          change_summary?: string | null
          chips?: string[]
          created_at?: string
          free_text?: string | null
          highlight_id?: string
          id?: string
          identity_side?: string | null
          match_video_id?: string
          new_segments?: Json | null
          outcome?: string
          outcome_detail?: string | null
          rating?: number | null
          regenerate?: boolean
          result_render_total?: number | null
          segments_snapshot?: Json | null
          updated_at?: string
          version?: number | null
          version_identity_side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_highlight_feedback_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_highlight_feedback_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "video_highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_highlight_feedback_match_video_id_fkey"
            columns: ["match_video_id"]
            isOneToOne: false
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_highlight_identity: {
        Row: {
          highlight_id: string
          identity_disputed_at: string | null
          identity_side: string
          live_identity_side: string | null
          updated_at: string
        }
        Insert: {
          highlight_id: string
          identity_disputed_at?: string | null
          identity_side?: string
          live_identity_side?: string | null
          updated_at?: string
        }
        Update: {
          highlight_id?: string
          identity_disputed_at?: string | null
          identity_side?: string
          live_identity_side?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_highlight_identity_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: true
            referencedRelation: "video_highlights"
            referencedColumns: ["id"]
          },
        ]
      }
      video_highlight_plans: {
        Row: {
          claimed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          invalid_moment_count: number
          latency_ms: number | null
          match_video_id: string
          model: string | null
          pending_since: string | null
          plan_attempts: number
          plan_total: number
          prompt_version: string | null
          redispatch_count: number
          redispatched_at: string | null
          result: Json | null
          selection: Json | null
          source_duration_s: number | null
          source_storage_path: string | null
          status: string
          updated_at: string
          usage: Json | null
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          invalid_moment_count?: number
          latency_ms?: number | null
          match_video_id: string
          model?: string | null
          pending_since?: string | null
          plan_attempts?: number
          plan_total?: number
          prompt_version?: string | null
          redispatch_count?: number
          redispatched_at?: string | null
          result?: Json | null
          selection?: Json | null
          source_duration_s?: number | null
          source_storage_path?: string | null
          status?: string
          updated_at?: string
          usage?: Json | null
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          invalid_moment_count?: number
          latency_ms?: number | null
          match_video_id?: string
          model?: string | null
          pending_since?: string | null
          plan_attempts?: number
          plan_total?: number
          prompt_version?: string | null
          redispatch_count?: number
          redispatched_at?: string | null
          result?: Json | null
          selection?: Json | null
          source_duration_s?: number | null
          source_storage_path?: string | null
          status?: string
          updated_at?: string
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "video_highlight_plans_match_video_id_fkey"
            columns: ["match_video_id"]
            isOneToOne: true
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_highlight_ready_notifications: {
        Row: {
          athlete_id: string
          created_at: string
          highlight_id: string
          id: string
          match_id: string
          origin: string
          seen_at: string | null
          version: number
        }
        Insert: {
          athlete_id: string
          created_at?: string
          highlight_id: string
          id?: string
          match_id: string
          origin: string
          seen_at?: string | null
          version: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          highlight_id?: string
          id?: string
          match_id?: string
          origin?: string
          seen_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_highlight_ready_notifications_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_highlight_ready_notifications_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "video_highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_highlight_ready_notifications_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      video_highlight_share_events: {
        Row: {
          athlete_id: string
          created_at: string
          detail: Json
          highlight_id: string
          id: number
          step: string
          version: number | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          detail?: Json
          highlight_id: string
          id?: never
          step: string
          version?: number | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          detail?: Json
          highlight_id?: string
          id?: never
          step?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_highlight_share_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_highlight_share_events_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "video_highlights"
            referencedColumns: ["id"]
          },
        ]
      }
      video_highlights: {
        Row: {
          athlete_id: string
          claimed_at: string | null
          created_at: string
          duration_s: number | null
          error_message: string | null
          id: string
          live_duration_s: number | null
          live_poster_path: string | null
          live_ready_at: string | null
          live_render_total: number | null
          live_segments: Json | null
          live_storage_path: string | null
          match_video_id: string
          origin: string
          pending_since: string | null
          poster_path: string | null
          redispatch_count: number
          redispatched_at: string | null
          render_attempts: number
          render_total: number
          segments: Json
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          claimed_at?: string | null
          created_at?: string
          duration_s?: number | null
          error_message?: string | null
          id?: string
          live_duration_s?: number | null
          live_poster_path?: string | null
          live_ready_at?: string | null
          live_render_total?: number | null
          live_segments?: Json | null
          live_storage_path?: string | null
          match_video_id: string
          origin?: string
          pending_since?: string | null
          poster_path?: string | null
          redispatch_count?: number
          redispatched_at?: string | null
          render_attempts?: number
          render_total?: number
          segments: Json
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          claimed_at?: string | null
          created_at?: string
          duration_s?: number | null
          error_message?: string | null
          id?: string
          live_duration_s?: number | null
          live_poster_path?: string | null
          live_ready_at?: string | null
          live_render_total?: number | null
          live_segments?: Json | null
          live_storage_path?: string | null
          match_video_id?: string
          origin?: string
          pending_since?: string | null
          poster_path?: string | null
          redispatch_count?: number
          redispatched_at?: string | null
          render_attempts?: number
          render_total?: number
          segments?: Json
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_highlights_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_highlights_match_video_id_fkey"
            columns: ["match_video_id"]
            isOneToOne: false
            referencedRelation: "match_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_upload_allowlist: {
        Row: {
          added_at: string
          athlete_id: string
          note: string | null
        }
        Insert: {
          added_at?: string
          athlete_id: string
          note?: string | null
        }
        Update: {
          added_at?: string
          athlete_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_upload_allowlist_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      video_upload_events: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          match_id: string | null
          video_id: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          match_id?: string | null
          video_id?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          match_id?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_upload_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
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
      _arm_highlight_plan: {
        Args: { p_match_video_id: string; p_storage_path: string }
        Returns: string
      }
      _arm_highlight_render: {
        Args: {
          p_athlete_id: string
          p_match_video_id: string
          p_only_if_absent_or_invalidated: boolean
          p_origin: string
          p_segments: Json
        }
        Returns: string
      }
      _fail_stale_pending_highlight: {
        Args: { p_expected_pending_since: string; p_highlight_id: string }
        Returns: boolean
      }
      _fail_stale_pending_highlight_plan: {
        Args: { p_expected_pending_since: string; p_plan_id: string }
        Returns: boolean
      }
      _gym_range_cutoff: { Args: { p_range: string }; Returns: string }
      _highlight_flag_changed_at: { Args: never; Returns: string }
      _highlight_list_item: { Args: { p_highlight_id: string }; Returns: Json }
      _highlight_match_facts: {
        Args: { p_highlight_id: string; p_side: string }
        Returns: Json
      }
      _highlight_max_seconds: { Args: never; Returns: number }
      _highlight_plan_max: { Args: never; Returns: number }
      _highlight_render_max: { Args: never; Returns: number }
      _reap_stale_highlight_claim: {
        Args: { p_expected_claimed_at: string; p_highlight_id: string }
        Returns: string
      }
      _reap_stale_highlight_plan_claim: {
        Args: { p_expected_claimed_at: string; p_plan_id: string }
        Returns: string
      }
      _redispatch_pending_highlight: {
        Args: {
          p_expected_pending_since: string
          p_expected_redispatched_at: string
          p_highlight_id: string
        }
        Returns: boolean
      }
      _redispatch_pending_highlight_plan: {
        Args: {
          p_expected_pending_since: string
          p_expected_redispatched_at: string
          p_plan_id: string
        }
        Returns: boolean
      }
      _scrub_highlight_message: {
        Args: { p_max?: number; p_text: string }
        Returns: string
      }
      _validate_highlight_feedback: {
        Args: { p_chips: string[]; p_free_text: string; p_rating: number }
        Returns: string
      }
      admin_add_gym_manager: {
        Args: { p_athlete_id: string; p_gym_id: string }
        Returns: undefined
      }
      admin_list_athletes: {
        Args: never
        Returns: {
          display_name: string
          id: string
          platform_role: Database["public"]["Enums"]["platform_role"]
          primary_gym_id: string
          primary_gym_name: string
        }[]
      }
      admin_list_managed_gyms: {
        Args: { p_athlete_id: string }
        Returns: {
          city: string
          granted_at: string
          gym_id: string
          gym_name: string
        }[]
      }
      admin_list_no_match_videos: {
        Args: { p_limit?: number; p_since?: string }
        Returns: {
          analysis_id: string
          analyzed_at: string
          current_match_detected: boolean
          match_completed_at: string
          match_id: string
          match_result: string
          match_status: string
          match_type: string
          no_match_count: number
          no_match_reason: string
          participants: Json
          superseded: boolean
          uploaded_by: string
          uploader_name: string
          verdict_count: number
          verdict_id: number
          verdict_storage_path: string
          video_created_at: string
          video_id: string
          video_status: string
        }[]
      }
      admin_list_repeat_disputers: {
        Args: never
        Returns: {
          athlete_id: string
          display_name: string
          last_lost_at: string
          lost_disputes_30d: number
          lost_match_ids: string[]
          total_disputes_30d: number
        }[]
      }
      admin_remove_gym_manager: {
        Args: { p_athlete_id: string; p_gym_id: string }
        Returns: undefined
      }
      admin_search_athletes: {
        Args: { p_query: string }
        Returns: {
          display_name: string
          id: string
          platform_role: Database["public"]["Enums"]["platform_role"]
        }[]
      }
      admin_set_feature_flag: {
        Args: { p_enabled: boolean; p_key: string }
        Returns: undefined
      }
      admin_set_platform_role: {
        Args: {
          p_athlete_id: string
          p_role: Database["public"]["Enums"]["platform_role"]
        }
        Returns: undefined
      }
      app_setting: { Args: { p_name: string }; Returns: string }
      apply_highlight_regeneration: {
        Args: {
          p_ai_latency_ms: number
          p_ai_model: string
          p_ai_output: Json
          p_ai_prompt_version: string
          p_change_summary: string
          p_feedback_id: string
          p_identity_side: string
          p_segments: Json
        }
        Returns: Json
      }
      assert_orphaned_object_sweep_healthy: { Args: never; Returns: string }
      auth_athlete_id: { Args: never; Returns: string }
      begin_highlight_regeneration: {
        Args: {
          p_athlete_id: string
          p_chips: string[]
          p_free_text: string
          p_highlight_id: string
          p_rating: number
        }
        Returns: Json
      }
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
      can_control_match: {
        Args: {
          p_caller_id: string
          p_match_id: string
          p_timekeeper_id: string
        }
        Returns: boolean
      }
      can_create_challenge:
        | { Args: never; Returns: boolean }
        | { Args: { p_opponent_id?: string }; Returns: boolean }
      cancel_session_match: { Args: { p_match_id: string }; Returns: Json }
      check_opponent_weight: {
        Args: { p_match_id: string; p_verdict: string; p_weight_seen?: number }
        Returns: Json
      }
      claim_highlight_for_render: {
        Args: { p_deadline_seconds?: number; p_highlight_id: string }
        Returns: {
          athlete_id: string
          claimed_at: string
          id: string
          match_video_id: string
          poster_path: string
          render_attempts: number
          segments: Json
          source_normalized_path: string
          source_storage_path: string
          storage_path: string
        }[]
      }
      claim_highlight_plan: {
        Args: { p_deadline_seconds?: number; p_plan_id: string }
        Returns: {
          appearance_hint: string
          athletes: Json
          claimed_at: string
          id: string
          match_id: string
          match_type: string
          match_video_id: string
          plan_attempts: number
          recorded_result: Json
          source_normalized_path: string
          source_storage_path: string
        }[]
      }
      claim_orphaned_storage_objects: {
        Args: { p_limit?: number }
        Returns: Json
      }
      claim_video_for_merging: {
        Args: { p_stale_minutes?: number; p_video_id: string }
        Returns: {
          id: string
          requested_tier: string
        }[]
      }
      claim_video_for_slicing: {
        Args: { p_stale_minutes?: number; p_video_id: string }
        Returns: {
          file_size_bytes: number
          id: string
          match_id: string
          storage_path: string
          uploaded_by: string
        }[]
      }
      cleanup_orphaned_chunk_objects: { Args: never; Returns: number }
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
      create_session_from_template: {
        Args: { p_scheduled_start?: string; p_template_id: string }
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
      enqueue_highlight_plan: {
        Args: { p_match_video_id: string }
        Returns: string
      }
      expire_pending_challenges: { Args: never; Returns: number }
      fail_highlight_regeneration: {
        Args: { p_detail: string; p_feedback_id: string; p_outcome: string }
        Returns: undefined
      }
      finalize_pending_merges: { Args: never; Returns: number }
      finish_orphaned_storage_sweep: {
        Args: { p_error?: string; p_removed: number; p_run_id: number }
        Returns: boolean
      }
      get_admin_metrics: { Args: never; Returns: Json }
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
      get_chunk_video_id: { Args: { p_chunk_id: string }; Returns: string }
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
      get_gym_athlete_detail: {
        Args: { p_athlete_id: string; p_gym_id: string }
        Returns: Json
      }
      get_gym_ladder: {
        Args: { p_city?: string; p_range?: string }
        Returns: {
          athlete_count: number
          avg_elo: number
          city: string
          gym_id: string
          gym_name: string
          match_count: number
          momentum: number
        }[]
      }
      get_gym_member_counts: {
        Args: never
        Returns: {
          gym_id: string
          member_count: number
        }[]
      }
      get_gym_roster: {
        Args: { p_gym_id: string }
        Returns: {
          athlete_id: string
          current_elo: number
          display_name: string
          draws: number
          elo_delta: number
          is_provisional: boolean
          last_active: string
          losses: number
          wins: number
        }[]
      }
      get_gym_stats: {
        Args: { p_gym_id: string; p_range?: string }
        Returns: Json
      }
      get_gym_stats_by_elo_range: {
        Args: { p_gym_id: string; p_range?: string }
        Returns: Json
      }
      get_highlight_detail: { Args: { p_highlight_id: string }; Returns: Json }
      get_highlight_flags: { Args: never; Returns: Json }
      get_highlight_progress: {
        Args: { p_match_video_id: string }
        Returns: Json
      }
      get_highlight_render_context: {
        Args: { p_highlight_id: string }
        Returns: Json
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
      get_match_rank_change: { Args: { p_match_id: string }; Returns: Json }
      get_match_videos: { Args: { p_match_id: string }; Returns: Json }
      get_match_weight_checks: { Args: { p_match_id: string }; Returns: Json }
      get_my_highlights: {
        Args: { p_before?: string; p_limit?: number; p_unseen_only?: boolean }
        Returns: Json
      }
      get_my_match_library: {
        Args: { p_before?: string; p_before_id?: string; p_limit?: number }
        Returns: Json
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
      get_video_progress: { Args: { p_video_id: string }; Returns: Json }
      get_weight_division: { Args: { p_weight: number }; Returns: number }
      highlight_plan_deadline_seconds: { Args: never; Returns: number }
      highlight_render_deadline_seconds: { Args: never; Returns: number }
      increment_chunks_completed: {
        Args: { p_video_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_founder: { Args: never; Returns: boolean }
      is_gym_manager: { Args: { p_gym_id: string }; Returns: boolean }
      is_highlight_rendering_enabled: { Args: never; Returns: boolean }
      is_highlight_share_enabled: { Args: never; Returns: boolean }
      is_match_video_participant: {
        Args: { p_video_id: string }
        Returns: boolean
      }
      is_valid_instagram_handle: { Args: { p: string }; Returns: boolean }
      is_video_upload_allowed: {
        Args: { p_athlete_id: string }
        Returns: boolean
      }
      is_video_visible: { Args: { p_video_id: string }; Returns: boolean }
      log_highlight_share_event: {
        Args: { p_detail?: Json; p_highlight_id: string; p_step: string }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      mark_highlight_seen: {
        Args: { p_highlight_id: string; p_version: number }
        Returns: undefined
      }
      mark_practice_match: {
        Args: { p_event: string }
        Returns: {
          practice_match_completed_at: string | null
          practice_match_offered_at: string
        }[]
      }
      match_result_lock_seconds: { Args: never; Returns: number }
      merge_finalize: {
        Args: { p_analysis: Json; p_technique_tags: Json; p_video_id: string }
        Returns: string
      }
      normalize_instagram_handle: { Args: { p: string }; Returns: string }
      notify_chunk_analyze: { Args: { p_chunk_id: string }; Returns: undefined }
      notify_merge_function: {
        Args: { p_video_id: string }
        Returns: undefined
      }
      opponent_accepts_match_type: {
        Args: {
          p_match_type: Database["public"]["Enums"]["match_type_enum"]
          p_opponent_id: string
        }
        Returns: boolean
      }
      orphan_sweep_function_url: { Args: never; Returns: string }
      orphaned_storage_object_candidates: {
        Args: { p_claimable?: boolean; p_limit?: number }
        Returns: {
          name: string
        }[]
      }
      pause_match: { Args: { p_match_id: string }; Returns: Json }
      persist_video_chunks_and_finalize_slice: {
        Args: { p_chunks: Json; p_video_id: string }
        Returns: Json
      }
      prepare_highlight_share: {
        Args: { p_highlight_id: string }
        Returns: Json
      }
      random_match: { Args: { p_session_id: string }; Returns: Json }
      reap_stuck_analyzing_chunks: { Args: never; Returns: number }
      reap_stuck_highlights: { Args: never; Returns: number }
      reap_stuck_slicing_videos: { Args: never; Returns: number }
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
      request_highlight_clip: {
        Args: { p_match_video_id: string; p_segments: Json }
        Returns: string
      }
      request_highlight_plan: {
        Args: { p_plan_id: string }
        Returns: undefined
      }
      request_highlight_render: {
        Args: { p_highlight_id: string }
        Returns: undefined
      }
      request_pending_video_slices: { Args: never; Returns: number }
      request_video_slice: { Args: { p_video_id: string }; Returns: undefined }
      resolve_dispute: {
        Args: {
          p_admin_notes?: string
          p_match_id: string
          p_resolution: string
        }
        Returns: Json
      }
      resume_match: { Args: { p_match_id: string }; Returns: Json }
      retry_failed_chunks: { Args: never; Returns: number }
      retry_highlight_render: {
        Args: { p_highlight_id: string }
        Returns: string
      }
      reweigh_for_match: {
        Args: { p_match_id: string; p_weight: number }
        Returns: Json
      }
      set_active_avatar: { Args: { p_avatar_id: string }; Returns: Json }
      set_athlete_role: {
        Args: {
          p_athlete_id: string
          p_role: Database["public"]["Enums"]["athlete_role"]
        }
        Returns: undefined
      }
      set_default_still: { Args: { p_still_url: string }; Returns: string }
      set_gym_instagram_handle: {
        Args: { p_gym_id: string; p_handle: string }
        Returns: Json
      }
      set_highlight_failed: {
        Args: {
          p_error_message?: string
          p_expected_claimed_at: string
          p_highlight_id: string
        }
        Returns: undefined
      }
      set_highlight_plan_failed: {
        Args: {
          p_error_message: string
          p_expected_claimed_at: string
          p_plan_id: string
        }
        Returns: undefined
      }
      set_highlight_plan_ready: {
        Args: {
          p_expected_claimed_at: string
          p_invalid_moment_count: number
          p_latency_ms: number
          p_model: string
          p_plan_id: string
          p_prompt_version: string
          p_result: Json
          p_selections: Json
          p_source_duration_s: number
          p_usage: Json
        }
        Returns: Json
      }
      set_highlight_ready: {
        Args: {
          p_duration_s?: number
          p_expected_claimed_at: string
          p_expected_storage_path: string
          p_highlight_id: string
          p_poster_path?: string
        }
        Returns: undefined
      }
      set_match_video_normalized_path: {
        Args: { p_normalized_path: string; p_video_id: string }
        Returns: undefined
      }
      set_match_video_thumbnail_url: {
        Args: {
          p_duration_seconds?: number
          p_expected_storage_path?: string
          p_thumbnail_height?: number
          p_thumbnail_url: string
          p_thumbnail_width?: number
          p_video_id: string
        }
        Returns: undefined
      }
      start_match: { Args: { p_match_id: string }; Returns: Json }
      start_match_from_challenge: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
      submit_highlight_feedback: {
        Args: {
          p_chips?: string[]
          p_free_text?: string
          p_highlight_id: string
          p_rating?: number
        }
        Returns: string
      }
      toggle_scoutable: { Args: { p_scoutable: boolean }; Returns: boolean }
      validate_highlight_segments: {
        Args: { p_segments: Json; p_source_duration_s: number }
        Returns: number
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
      platform_role: "member" | "admin" | "founder"
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
      platform_role: ["member", "admin", "founder"],
    },
  },
} as const

