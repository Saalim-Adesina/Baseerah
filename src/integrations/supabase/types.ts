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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      billing_webhook_events: {
        Row: {
          applied_row: Json | null
          event_id: string | null
          event_type: string
          external_customer_id: string | null
          id: string
          mapped_plan: string | null
          mapped_seats: number | null
          mapping_source: string | null
          matched_email: string | null
          matched_user_id: string | null
          notes: string | null
          outcome: string
          payload: Json | null
          polar_customer_id: string | null
          polar_product_id: string | null
          polar_subscription_id: string | null
          received_at: string
          signature_valid: boolean
        }
        Insert: {
          applied_row?: Json | null
          event_id?: string | null
          event_type: string
          external_customer_id?: string | null
          id?: string
          mapped_plan?: string | null
          mapped_seats?: number | null
          mapping_source?: string | null
          matched_email?: string | null
          matched_user_id?: string | null
          notes?: string | null
          outcome: string
          payload?: Json | null
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          received_at?: string
          signature_valid?: boolean
        }
        Update: {
          applied_row?: Json | null
          event_id?: string | null
          event_type?: string
          external_customer_id?: string | null
          id?: string
          mapped_plan?: string | null
          mapped_seats?: number | null
          mapping_source?: string | null
          matched_email?: string | null
          matched_user_id?: string | null
          notes?: string | null
          outcome?: string
          payload?: Json | null
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          received_at?: string
          signature_valid?: boolean
        }
        Relationships: []
      }
      onboarding_responses: {
        Row: {
          check_size: string | null
          completed_at: string | null
          connect_inbox: boolean | null
          created_at: string
          deals_per_month: string | null
          heard_from: string | null
          heard_from_detail: string | null
          hours_per_month: string | null
          industries: string[]
          industries_other: string | null
          review_method: string | null
          thesis_sentence: string | null
          tools: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          check_size?: string | null
          completed_at?: string | null
          connect_inbox?: boolean | null
          created_at?: string
          deals_per_month?: string | null
          heard_from?: string | null
          heard_from_detail?: string | null
          hours_per_month?: string | null
          industries?: string[]
          industries_other?: string | null
          review_method?: string | null
          thesis_sentence?: string | null
          tools?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          check_size?: string | null
          completed_at?: string | null
          connect_inbox?: boolean | null
          created_at?: string
          deals_per_month?: string | null
          heard_from?: string | null
          heard_from_detail?: string | null
          hours_per_month?: string | null
          industries?: string[]
          industries_other?: string | null
          review_method?: string | null
          thesis_sentence?: string | null
          tools?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          deal_inbox_email: string | null
          email: string | null
          firm_name: string | null
          full_name: string | null
          id: string
          investor_type: Database["public"]["Enums"]["investor_type"]
          onboarding_completed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_inbox_email?: string | null
          email?: string | null
          firm_name?: string | null
          full_name?: string | null
          id: string
          investor_type?: Database["public"]["Enums"]["investor_type"]
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_inbox_email?: string | null
          email?: string | null
          firm_name?: string | null
          full_name?: string | null
          id?: string
          investor_type?: Database["public"]["Enums"]["investor_type"]
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          deals_screened_this_period: number
          id: string
          manual_override_at: string | null
          override_reason: string | null
          plan: string
          polar_customer_id: string | null
          polar_product_id: string | null
          polar_subscription_id: string | null
          seats: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          deals_screened_this_period?: number
          id?: string
          manual_override_at?: string | null
          override_reason?: string | null
          plan?: string
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          seats?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          deals_screened_this_period?: number
          id?: string
          manual_override_at?: string | null
          override_reason?: string | null
          plan?: string
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          seats?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invite_token: string | null
          invited_at: string
          member_user_id: string | null
          owner_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invite_token?: string | null
          invited_at?: string
          member_user_id?: string | null
          owner_id: string
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invite_token?: string | null
          invited_at?: string
          member_user_id?: string | null
          owner_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invite: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      team_invite_preview: { Args: { _token: string }; Returns: Json }
    }
    Enums: {
      app_role: "superadmin" | "admin" | "member"
      investor_type:
        | "angel"
        | "syndicate"
        | "incubator"
        | "vc"
        | "family_office"
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
      app_role: ["superadmin", "admin", "member"],
      investor_type: ["angel", "syndicate", "incubator", "vc", "family_office"],
    },
  },
} as const
