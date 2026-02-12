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
      business_settings: {
        Row: {
          address: string | null
          business_name: string
          exchange_rate: number
          id: string
          phone: string | null
          printer_config: Json | null
          ruc: string | null
          ticket_template: Json | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_name?: string
          exchange_rate?: number
          id?: string
          phone?: string | null
          printer_config?: Json | null
          ruc?: string | null
          ticket_template?: Json | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_name?: string
          exchange_rate?: number
          id?: string
          phone?: string | null
          printer_config?: Json | null
          ruc?: string | null
          ticket_template?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      cash_closures: {
        Row: {
          bills_count: Json | null
          cashier_id: string
          closed_at: string
          coins_count: Json | null
          counted_total: number | null
          difference: number | null
          expected_total: number | null
          id: string
          initial_balance: number
          observations: string | null
          shift: string | null
          total_card: number | null
          total_cash_nio: number | null
          total_cash_usd: number | null
          total_expenses: number | null
          total_transfer: number | null
        }
        Insert: {
          bills_count?: Json | null
          cashier_id: string
          closed_at?: string
          coins_count?: Json | null
          counted_total?: number | null
          difference?: number | null
          expected_total?: number | null
          id?: string
          initial_balance?: number
          observations?: string | null
          shift?: string | null
          total_card?: number | null
          total_cash_nio?: number | null
          total_cash_usd?: number | null
          total_expenses?: number | null
          total_transfer?: number | null
        }
        Update: {
          bills_count?: Json | null
          cashier_id?: string
          closed_at?: string
          coins_count?: Json | null
          counted_total?: number | null
          difference?: number | null
          expected_total?: number | null
          id?: string
          initial_balance?: number
          observations?: string | null
          shift?: string | null
          total_card?: number | null
          total_cash_nio?: number | null
          total_cash_usd?: number | null
          total_expenses?: number | null
          total_transfer?: number | null
        }
        Relationships: []
      }
      cash_expenses: {
        Row: {
          amount: number
          category: string
          closure_id: string | null
          created_at: string
          description: string
          id: string
          receipt: string | null
        }
        Insert: {
          amount?: number
          category?: string
          closure_id?: string | null
          created_at?: string
          description?: string
          id?: string
          receipt?: string | null
        }
        Update: {
          amount?: number
          category?: string
          closure_id?: string | null
          created_at?: string
          description?: string
          id?: string
          receipt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_expenses_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "cash_closures"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_memberships: {
        Row: {
          active: boolean
          created_at: string
          customer_id: string
          id: string
          plan_id: string
          washes_used: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          customer_id: string
          id?: string
          plan_id: string
          washes_used?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          customer_id?: string
          id?: string
          plan_id?: string
          washes_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_general: boolean
          name: string
          phone: string | null
          plate: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_general?: boolean
          name: string
          phone?: string | null
          plate?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_general?: boolean
          name?: string
          phone?: string | null
          plate?: string | null
        }
        Relationships: []
      }
      membership_plans: {
        Row: {
          active: boolean
          applies_to_service: string | null
          bonus_rule: string | null
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          name: string
          wash_count: number
        }
        Insert: {
          active?: boolean
          applies_to_service?: string | null
          bonus_rule?: string | null
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          name: string
          wash_count?: number
        }
        Update: {
          active?: boolean
          applies_to_service?: string | null
          bonus_rule?: string | null
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          name?: string
          wash_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_applies_to_service_fkey"
            columns: ["applies_to_service"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          amount_received: number
          change_amount: number
          created_at: string
          currency: string
          exchange_rate: number
          id: string
          payment_method: string
          ticket_id: string
        }
        Insert: {
          amount: number
          amount_received?: number
          change_amount?: number
          created_at?: string
          currency?: string
          exchange_rate?: number
          id?: string
          payment_method?: string
          ticket_id: string
        }
        Update: {
          amount?: number
          amount_received?: number
          change_amount?: number
          created_at?: string
          currency?: string
          exchange_rate?: number
          id?: string
          payment_method?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      service_prices: {
        Row: {
          id: string
          price: number
          service_id: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          id?: string
          price: number
          service_id: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          id?: string
          price?: number
          service_id?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "service_prices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          includes: string[] | null
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          includes?: string[] | null
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          includes?: string[] | null
          name?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          cashier_id: string
          created_at: string
          customer_id: string | null
          discount: number
          id: string
          membership_id: string | null
          notes: string | null
          plate: string | null
          service_id: string
          status: string
          subtotal: number
          ticket_number: number
          total: number
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          cashier_id: string
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          membership_id?: string | null
          notes?: string | null
          plate?: string | null
          service_id: string
          status?: string
          subtotal?: number
          ticket_number?: number
          total?: number
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          cashier_id?: string
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          membership_id?: string | null
          notes?: string | null
          plate?: string | null
          service_id?: string
          status?: string
          subtotal?: number
          ticket_number?: number
          total?: number
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "customer_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "cajero"
      vehicle_type: "moto" | "sedan" | "suv" | "pickup" | "microbus"
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
      app_role: ["admin", "cajero"],
      vehicle_type: ["moto", "sedan", "suv", "pickup", "microbus"],
    },
  },
} as const
