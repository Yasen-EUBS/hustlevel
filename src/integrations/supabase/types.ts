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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      exercise_notes: {
        Row: {
          exercise_key: string
          id: string
          note: string
          session_id: string
          user_id: string
        }
        Insert: {
          exercise_key: string
          id?: string
          note?: string
          session_id: string
          user_id?: string
        }
        Update: {
          exercise_key?: string
          id?: string
          note?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      program_days: {
        Row: {
          day_notes: string | null
          id: string
          program_id: string
          sort_order: number
          title: string
          weekday: number
        }
        Insert: {
          day_notes?: string | null
          id?: string
          program_id: string
          sort_order?: number
          title: string
          weekday: number
        }
        Update: {
          day_notes?: string | null
          id?: string
          program_id?: string
          sort_order?: number
          title?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_exercises: {
        Row: {
          duration_seconds: number | null
          id: string
          letter: string
          name: string
          note: string | null
          program_day_id: string
          rep_max: number | null
          rep_min: number | null
          rest_max_seconds: number
          rest_min_seconds: number
          section: string
          sets: number
          tempo: string | null
        }
        Insert: {
          duration_seconds?: number | null
          id?: string
          letter: string
          name: string
          note?: string | null
          program_day_id: string
          rep_max?: number | null
          rep_min?: number | null
          rest_max_seconds?: number
          rest_min_seconds?: number
          section?: string
          sets?: number
          tempo?: string | null
        }
        Update: {
          duration_seconds?: number | null
          id?: string
          letter?: string
          name?: string
          note?: string | null
          program_day_id?: string
          rep_max?: number | null
          rep_min?: number | null
          rest_max_seconds?: number
          rest_min_seconds?: number
          section?: string
          sets?: number
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          block_name: string
          coach_notes: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          start_date: string
          total_weeks: number
        }
        Insert: {
          block_name: string
          coach_notes?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          start_date: string
          total_weeks: number
        }
        Update: {
          block_name?: string
          coach_notes?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          total_weeks?: number
        }
        Relationships: []
      }
      set_logs: {
        Row: {
          completed: boolean
          created_at: string
          exercise_key: string
          exercise_name: string
          id: string
          reps: number | null
          session_id: string
          set_number: number
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          completed?: boolean
          created_at?: string
          exercise_key: string
          exercise_name: string
          id?: string
          reps?: number | null
          session_id: string
          set_number: number
          user_id?: string
          weight_kg?: number | null
        }
        Update: {
          completed?: boolean
          created_at?: string
          exercise_key?: string
          exercise_name?: string
          id?: string
          reps?: number | null
          session_id?: string
          set_number?: number
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          completed_at: string | null
          day_title: string | null
          id: string
          notes: string | null
          program_day_id: string | null
          session_date: string
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          day_title?: string | null
          id?: string
          notes?: string | null
          program_day_id?: string | null
          session_date: string
          started_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          day_title?: string | null
          id?: string
          notes?: string | null
          program_day_id?: string | null
          session_date?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
