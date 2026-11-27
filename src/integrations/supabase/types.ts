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
      product_variants: {
        Row: {
          store_id: string
          active: boolean
          color: string
          cost_price: number
          created_at: string
          id: string
          min_stock: number
          product_id: string
          sale_price: number
          size: string
          sku: string
          stock: number
          updated_at: string
        }
        Insert: {
          store_id: string
          active?: boolean
          color?: string
          cost_price?: number
          created_at?: string
          id?: string
          min_stock?: number
          product_id: string
          sale_price?: number
          size?: string
          sku: string
          stock?: number
          updated_at?: string
        }
        Update: {
          store_id?: string
          active?: boolean
          color?: string
          cost_price?: number
          created_at?: string
          id?: string
          min_stock?: number
          product_id?: string
          sale_price?: number
          size?: string
          sku?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_fkey"
            columns: ["product_id", "store_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      products: {
        Row: {
          image_url: string | null
          store_id: string
          active: boolean
          category: string
          code: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          image_url?: string | null
          store_id: string
          active?: boolean
          category?: string
          code?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          image_url?: string | null
          store_id?: string
          active?: boolean
          category?: string
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          store_id: string
          color: string
          id: string
          line_total: number
          product_name: string
          quantity: number
          sale_id: string
          size: string
          sku: string
          unit_cost: number
          unit_price: number
          variant_id: string
        }
        Insert: {
          store_id: string
          color: string
          id?: string
          line_total: number
          product_name: string
          quantity: number
          sale_id: string
          size: string
          sku: string
          unit_cost: number
          unit_price: number
          variant_id: string
        }
        Update: {
          store_id?: string
          color?: string
          id?: string
          line_total?: number
          product_name?: string
          quantity?: number
          sale_id?: string
          size?: string
          sku?: string
          unit_cost?: number
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_fkey"
            columns: ["sale_id", "store_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "sale_items_variant_fkey"
            columns: ["variant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          store_id: string
          amount: number
          id: string
          method: string
          sale_id: string
        }
        Insert: {
          store_id: string
          amount: number
          id?: string
          method: string
          sale_id: string
        }
        Update: {
          store_id?: string
          amount?: number
          id?: string
          method?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_fkey"
            columns: ["sale_id", "store_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      sales: {
        Row: {
          store_id: string
          cancel_reason: string | null
          canceled_at: string | null
          canceled_by: string | null
          client_token: string
          created_at: string
          created_by: string
          discount: number
          id: string
          items_count: number
          number: number
          status: string
          subtotal: number
          total: number
        }
        Insert: {
          store_id: string
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          client_token: string
          created_at?: string
          created_by: string
          discount?: number
          id?: string
          items_count: number
          number?: never
          status?: string
          subtotal: number
          total: number
        }
        Update: {
          store_id?: string
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          client_token?: string
          created_at?: string
          created_by?: string
          discount?: number
          id?: string
          items_count?: number
          number?: never
          status?: string
          subtotal?: number
          total?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          store_id: string
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          quantity: number
          reason: string
          sale_id: string | null
          stock_after: number
          variant_id: string
        }
        Insert: {
          store_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          quantity: number
          reason: string
          sale_id?: string | null
          stock_after: number
          variant_id: string
        }
        Update: {
          store_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          quantity?: number
          reason?: string
          sale_id?: string | null
          stock_after?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_sale_fkey"
            columns: ["sale_id", "store_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_fkey"
            columns: ["variant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      store_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string | null
          default_min_stock: number
          store_id: string
          logo_url: string | null
          phone: string | null
          store_name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          default_min_stock?: number
          store_id: string
          logo_url?: string | null
          phone?: string | null
          store_name?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          default_min_stock?: number
          logo_url?: string | null
          phone?: string | null
          store_id?: string
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_sale_number: number
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_sale_number?: number
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_sale_number?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_store_user: {
        Args: { p_email: string; p_role: string; p_store_id: string }
        Returns: undefined
      }
      can_manage_catalog: { Args: { _store_id: string }; Returns: boolean }
      cancel_sale: {
        Args: { p_reason: string; p_sale_id: string; p_store_id: string }
        Returns: Json
      }
      create_sale: {
        Args: {
          p_client_token: string
          p_discount: number
          p_items: Json
          p_payments: Json
          p_store_id: string
        }
        Returns: Json
      }
      create_store: {
        Args: { p_name: string; p_slug?: string }
        Returns: string
      }
      dashboard_summary: { Args: { p_store_id: string }; Returns: Json }
      delete_product: {
        Args: { p_product_id: string; p_store_id: string }
        Returns: undefined
      }
      get_public_catalog: { Args: { p_slug: string }; Returns: Json }
      get_sale_details: {
        Args: { p_sale_id: string; p_store_id: string }
        Returns: Json
      }
      get_variant_costs: {
        Args: { p_store_id: string }
        Returns: {
          cost_price: number
          variant_id: string
        }[]
      }
      is_store_admin: { Args: { _store_id: string }; Returns: boolean }
      is_store_member: { Args: { _store_id: string }; Returns: boolean }
      list_store_users: {
        Args: { p_store_id: string }
        Returns: {
          created_at: string
          email: string
          role: string
          user_id: string
        }[]
      }
      register_stock_movement: {
        Args: {
          p_quantity: number
          p_reason: string
          p_store_id: string
          p_type: string
          p_variant_id: string
        }
        Returns: number
      }
      report_profit: {
        Args: { p_end: string; p_start: string; p_store_id: string }
        Returns: Json
      }
      report_sales: {
        Args: { p_end: string; p_start: string; p_store_id: string }
        Returns: Json
      }
      report_stock: { Args: { p_store_id: string }; Returns: Json }
      save_product: {
        Args: {
          p_active: boolean
          p_category: string
          p_code: string
          p_image_url?: string
          p_name: string
          p_product_id: string
          p_store_id: string
          p_variants: Json
        }
        Returns: string
      }
      update_store_settings: {
        Args: {
          p_address: string
          p_default_min_stock: number
          p_logo_url: string
          p_phone: string
          p_slug?: string
          p_store_id: string
          p_store_name: string
        }
        Returns: undefined
      }
      set_store_user_role: {
        Args: { p_role: string; p_store_id: string; p_user_id: string }
        Returns: undefined
      }
      slugify: { Args: { _t: string }; Returns: string }
      try_uuid: { Args: { _t: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "vendedor"
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
    Enums: {
      app_role: ["admin", "vendedor"],
    },
  },
} as const
