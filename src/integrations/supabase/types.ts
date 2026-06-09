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
            business_settings: {
                Row: {
                    address: string | null
                    business_name: string
                    business_line: Database["public"]["Enums"]["business_line"]
                    email: string | null
                    exchange_rate: number
                    id: number
                    logo_url: string | null
                    phone: string | null
                    printer_width_mm: number
                    qr_image_url: string | null
                    qr_text: string | null
                    receipt_footer: string | null
                    ruc: string | null
                    social_media: string | null
                    double_print_ticket: boolean
                    updated_at: string | null
                }
                Insert: {
                    address?: string | null
                    business_line?: Database["public"]["Enums"]["business_line"]
                    business_name?: string
                    email?: string | null
                    exchange_rate?: number
                    id?: number
                    logo_url?: string | null
                    phone?: string | null
                    printer_width_mm?: number
                    qr_image_url?: string | null
                    qr_text?: string | null
                    receipt_footer?: string | null
                    ruc?: string | null
                    social_media?: string | null
                    double_print_ticket?: boolean
                    updated_at?: string | null
                }
                Update: {
                    address?: string | null
                    business_line?: Database["public"]["Enums"]["business_line"]
                    business_name?: string
                    email?: string | null
                    exchange_rate?: number
                    id?: number
                    logo_url?: string | null
                    phone?: string | null
                    printer_width_mm?: number
                    qr_image_url?: string | null
                    qr_text?: string | null
                    receipt_footer?: string | null
                    ruc?: string | null
                    social_media?: string | null
                    double_print_ticket?: boolean
                    updated_at?: string | null
                }
                Relationships: []
            }
            cash_closures: {
                Row: {
                    bills_count: Json | null
                    business_line: Database["public"]["Enums"]["business_line"]
                    cashier_id: string
                    closed_at: string
                    coins_count: Json | null
                    counted_total: number
                    difference: number
                    expected_total: number
                    id: number
                    initial_balance: number
                    observations: string | null
                    shift: string
                    total_card: number
                    total_cash_nio: number
                    total_cash_usd: number
                    total_expenses: number
                    total_transfer: number
                }
                Insert: {
                    bills_count?: Json | null
                    business_line?: Database["public"]["Enums"]["business_line"]
                    cashier_id: string
                    closed_at?: string
                    coins_count?: Json | null
                    counted_total?: number
                    difference?: number
                    expected_total?: number
                    id?: number
                    initial_balance?: number
                    observations?: string | null
                    shift: string
                    total_card?: number
                    total_cash_nio?: number
                    total_cash_usd?: number
                    total_expenses?: number
                    total_transfer?: number
                }
                Update: {
                    bills_count?: Json | null
                    business_line?: Database["public"]["Enums"]["business_line"]
                    cashier_id?: string
                    closed_at?: string
                    coins_count?: Json | null
                    counted_total?: number
                    difference?: number
                    expected_total?: number
                    id?: number
                    initial_balance?: number
                    observations?: string | null
                    shift?: string
                    total_card?: number
                    total_cash_nio?: number
                    total_cash_usd?: number
                    total_expenses?: number
                    total_transfer?: number
                }
                Relationships: []
            }
            products: {
                Row: {
                    id: number
                    name: string
                    description: string | null
                    sku: string | null
                    price: number
                    stock_quantity: number
                    min_stock_level: number
                    is_active: boolean
                    sort_order: number
                    icon: string | null
                    business_line: Database["public"]["Enums"]["business_line"]
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: number
                    name: string
                    description?: string | null
                    sku?: string | null
                    price: number
                    stock_quantity?: number
                    min_stock_level?: number
                    is_active?: boolean
                    sort_order?: number
                    icon?: string | null
                    business_line?: Database["public"]["Enums"]["business_line"]
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: number
                    name?: string
                    description?: string | null
                    sku?: string | null
                    price?: number
                    stock_quantity?: number
                    min_stock_level?: number
                    is_active?: boolean
                    sort_order?: number
                    icon?: string | null
                    business_line?: Database["public"]["Enums"]["business_line"]
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            stock_movements: {
                Row: {
                    id: number
                    product_id: number
                    quantity_delta: number
                    reason: Database["public"]["Enums"]["stock_movement_reason"]
                    ticket_id: number | null
                    user_id: string | null
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: number
                    product_id: number
                    quantity_delta: number
                    reason: Database["public"]["Enums"]["stock_movement_reason"]
                    ticket_id?: number | null
                    user_id?: string | null
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    id?: number
                    product_id?: number
                    quantity_delta?: number
                    reason?: Database["public"]["Enums"]["stock_movement_reason"]
                    ticket_id?: number | null
                    user_id?: string | null
                    notes?: string | null
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "stock_movements_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                ]
            }
            cash_expenses: {
                Row: {
                    amount: number
                    category: string
                    closure_id: number
                    created_at: string
                    description: string
                    id: number
                }
                Insert: {
                    amount: number
                    category: string
                    closure_id: number
                    created_at?: string
                    description: string
                    id?: number
                }
                Update: {
                    amount?: number
                    category?: string
                    closure_id?: number
                    created_at?: string
                    description?: string
                    id?: number
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
            cash_registers: {
                Row: {
                    closed_at: string | null
                    closing_amount: number | null
                    expected_amount: number | null
                    id: number
                    opened_at: string
                    opening_amount: number
                    user_id: string | null
                }
                Insert: {
                    closed_at?: string | null
                    closing_amount?: number | null
                    expected_amount?: number | null
                    id?: number
                    opened_at?: string
                    opening_amount: number
                    user_id?: string | null
                }
                Update: {
                    closed_at?: string | null
                    closing_amount?: number | null
                    expected_amount?: number | null
                    id?: number
                    opened_at?: string
                    opening_amount?: number
                    user_id?: string | null
                }
                Relationships: []
            }
            customer_memberships: {
                Row: {
                    active: boolean
                    bonus_washes_earned: number
                    created_at: string
                    customer_id: number
                    expires_at: string | null
                    id: number
                    plan_id: number
                    total_washes_allowed: number
                    vehicle_type_id: number | null
                    washes_used: number
                }
                Insert: {
                    active?: boolean
                    bonus_washes_earned?: number
                    created_at?: string
                    customer_id: number
                    expires_at?: string | null
                    id?: number
                    plan_id: number
                    total_washes_allowed?: number
                    vehicle_type_id?: number | null
                    washes_used?: number
                }
                Update: {
                    active?: boolean
                    bonus_washes_earned?: number
                    created_at?: string
                    customer_id?: number
                    expires_at?: string | null
                    id?: number
                    plan_id?: number
                    total_washes_allowed?: number
                    vehicle_type_id?: number | null
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
                    {
                        foreignKeyName: "customer_memberships_vehicle_type_id_fkey"
                        columns: ["vehicle_type_id"]
                        isOneToOne: false
                        referencedRelation: "vehicle_types"
                        referencedColumns: ["id"]
                    },
                ]
            }
            customers: {
                Row: {
                    created_at: string
                    email: string | null
                    id: number
                    is_general: boolean
                    name: string
                    phone: string | null
                    plate: string | null
                }
                Insert: {
                    created_at?: string
                    email?: string | null
                    id?: number
                    is_general?: boolean
                    name: string
                    phone?: string | null
                    plate?: string | null
                }
                Update: {
                    created_at?: string
                    email?: string | null
                    id?: number
                    is_general?: boolean
                    name?: string
                    phone?: string | null
                    plate?: string | null
                }
                Relationships: []
            }
            membership_plans: {
                Row: {
                    created_at: string
                    description: string | null
                    discount_percent: number
                    duration_days: number
                    id: number
                    is_active: boolean
                    name: string
                    wash_count: number
                }
                Insert: {
                    created_at?: string
                    description?: string | null
                    discount_percent?: number
                    duration_days?: number
                    id?: number
                    is_active?: boolean
                    name: string
                    wash_count?: number
                }
                Update: {
                    created_at?: string
                    description?: string | null
                    discount_percent?: number
                    duration_days?: number
                    id?: number
                    is_active?: boolean
                    name?: string
                    wash_count?: number
                }
                Relationships: []
            }
            membership_washes: {
                Row: {
                    created_at: string
                    id: number
                    is_bonus: boolean
                    membership_id: number
                    service_id: number
                    ticket_id: number | null
                }
                Insert: {
                    created_at?: string
                    id?: number
                    is_bonus?: boolean
                    membership_id: number
                    service_id: number
                    ticket_id?: number | null
                }
                Update: {
                    created_at?: string
                    id?: number
                    is_bonus?: boolean
                    membership_id?: number
                    service_id?: number
                    ticket_id?: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: "membership_washes_membership_id_fkey"
                        columns: ["membership_id"]
                        isOneToOne: false
                        referencedRelation: "customer_memberships"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "membership_washes_service_id_fkey"
                        columns: ["service_id"]
                        isOneToOne: false
                        referencedRelation: "services"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "membership_washes_ticket_id_fkey"
                        columns: ["ticket_id"]
                        isOneToOne: false
                        referencedRelation: "tickets"
                        referencedColumns: ["id"]
                    },
                ]
            }
            payments: {
                Row: {
                    amount: number
                    amount_received: number | null
                    change_amount: number | null
                    created_at: string
                    currency: string
                    exchange_rate: number | null
                    id: number
                    payment_method: string
                    ticket_id: number
                }
                Insert: {
                    amount: number
                    amount_received?: number | null
                    change_amount?: number | null
                    created_at?: string
                    currency?: string
                    exchange_rate?: number | null
                    id?: number
                    payment_method: string
                    ticket_id: number
                }
                Update: {
                    amount?: number
                    amount_received?: number | null
                    change_amount?: number | null
                    created_at?: string
                    currency?: string
                    exchange_rate?: number | null
                    id?: number
                    payment_method?: string
                    ticket_id?: number
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
                    full_name: string | null
                    id: string
                    role: string | null
                    updated_at: string | null
                }
                Insert: {
                    active?: boolean
                    created_at?: string
                    full_name?: string | null
                    id: string
                    role?: string | null
                    updated_at?: string | null
                }
                Update: {
                    active?: boolean
                    created_at?: string
                    full_name?: string | null
                    id?: string
                    role?: string | null
                    updated_at?: string | null
                }
                Relationships: []
            }
            service_prices: {
                Row: {
                    created_at: string
                    id: number
                    price: number
                    service_id: number
                    vehicle_type_id: number
                }
                Insert: {
                    created_at?: string
                    id?: number
                    price: number
                    service_id: number
                    vehicle_type_id: number
                }
                Update: {
                    created_at?: string
                    id?: number
                    price?: number
                    service_id?: number
                    vehicle_type_id?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "service_prices_service_id_fkey"
                        columns: ["service_id"]
                        isOneToOne: false
                        referencedRelation: "services"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "service_prices_vehicle_type_id_fkey"
                        columns: ["vehicle_type_id"]
                        isOneToOne: false
                        referencedRelation: "vehicle_types"
                        referencedColumns: ["id"]
                    },
                ]
            }
            services: {
                Row: {
                    base_price: number | null
                    business_line: Database["public"]["Enums"]["business_line"]
                    color: string | null
                    created_at: string
                    description: string | null
                    icon: string | null
                    id: number
                    is_active: boolean | null
                    is_extra: boolean
                    name: string
                    sort_order: number | null
                }
                Insert: {
                    base_price?: number | null
                    business_line?: Database["public"]["Enums"]["business_line"]
                    color?: string | null
                    created_at?: string
                    description?: string | null
                    icon?: string | null
                    id?: number
                    is_active?: boolean | null
                    is_extra?: boolean
                    name: string
                    sort_order?: number | null
                }
                Update: {
                    base_price?: number | null
                    business_line?: Database["public"]["Enums"]["business_line"]
                    color?: string | null
                    created_at?: string
                    description?: string | null
                    icon?: string | null
                    id?: number
                    is_active?: boolean | null
                    is_extra?: boolean
                    name?: string
                    sort_order?: number | null
                }
                Relationships: []
            }
            ticket_mixed_payments: {
                Row: {
                    id: number
                    ticket_id: number
                    method: string
                    currency: string
                    amount: number
                    exchange_rate: number
                    amount_nio: number
                    applied_nio: number
                    change_nio: number
                    created_at: string
                }
                Insert: {
                    id?: number
                    ticket_id: number
                    method: string
                    currency?: string
                    amount: number
                    exchange_rate?: number
                    amount_nio: number
                    applied_nio?: number
                    change_nio?: number
                    created_at?: string
                }
                Update: {
                    id?: number
                    ticket_id?: number
                    method?: string
                    currency?: string
                    amount?: number
                    exchange_rate?: number
                    amount_nio?: number
                    applied_nio?: number
                    change_nio?: number
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "ticket_mixed_payments_ticket_id_fkey"
                        columns: ["ticket_id"]
                        isOneToOne: false
                        referencedRelation: "tickets"
                        referencedColumns: ["id"]
                    },
                ]
            }
            ticket_items: {
                Row: {
                    created_at: string
                    id: number
                    item_type: Database["public"]["Enums"]["ticket_item_type"]
                    price: number
                    price_snapshot: number | null
                    product_id: number | null
                    quantity: number
                    service_id: number | null
                    service_name_snapshot: string | null
                    ticket_id: number
                }
                Insert: {
                    created_at?: string
                    id?: number
                    item_type?: Database["public"]["Enums"]["ticket_item_type"]
                    price: number
                    price_snapshot?: number | null
                    product_id?: number | null
                    quantity?: number
                    service_id?: number | null
                    service_name_snapshot?: string | null
                    ticket_id: number
                }
                Update: {
                    created_at?: string
                    id?: number
                    item_type?: Database["public"]["Enums"]["ticket_item_type"]
                    price?: number
                    price_snapshot?: number | null
                    product_id?: number | null
                    quantity?: number
                    service_id?: number | null
                    service_name_snapshot?: string | null
                    ticket_id?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "ticket_items_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "ticket_items_service_id_fkey"
                        columns: ["service_id"]
                        isOneToOne: false
                        referencedRelation: "services"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "ticket_items_ticket_id_fkey"
                        columns: ["ticket_id"]
                        isOneToOne: false
                        referencedRelation: "tickets"
                        referencedColumns: ["id"]
                    },
                ]
            }
            tickets: {
                Row: {
                    business_line: Database["public"]["Enums"]["business_line"]
                    created_at: string
                    id: number
                    status: string | null
                    ticket_number: string | null
                    total: number | null
                    updated_at: string
                    user_id: string | null
                    vehicle_plate: string | null
                    vehicle_type_id: number | null
                }
                Insert: {
                    business_line?: Database["public"]["Enums"]["business_line"]
                    created_at?: string
                    id?: number
                    status?: string | null
                    ticket_number?: string | null
                    total?: number | null
                    updated_at?: string
                    user_id?: string | null
                    vehicle_plate?: string | null
                    vehicle_type_id?: number | null
                }
                Update: {
                    business_line?: Database["public"]["Enums"]["business_line"]
                    created_at?: string
                    id?: number
                    status?: string | null
                    ticket_number?: string | null
                    total?: number | null
                    updated_at?: string
                    user_id?: string | null
                    vehicle_plate?: string | null
                    vehicle_type_id?: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: "tickets_vehicle_type_id_fkey"
                        columns: ["vehicle_type_id"]
                        isOneToOne: false
                        referencedRelation: "vehicle_types"
                        referencedColumns: ["id"]
                    },
                ]
            }
            vehicle_types: {
                Row: {
                    created_at: string
                    icon: string | null
                    id: number
                    is_active: boolean
                    key: string | null
                    name: string
                    sort_order: number | null
                }
                Insert: {
                    created_at?: string
                    icon?: string | null
                    id?: number
                    is_active?: boolean
                    key?: string | null
                    name: string
                    sort_order?: number | null
                }
                Update: {
                    created_at?: string
                    icon?: string | null
                    id?: number
                    is_active?: boolean
                    key?: string | null
                    name?: string
                    sort_order?: number | null
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            decrement_product_stock: {
                Args: {
                    p_product_id: number
                    p_qty: number
                    p_ticket_id?: number
                }
                Returns: Json
            }
            adjust_product_stock: {
                Args: {
                    p_product_id: number
                    p_delta: number
                    p_reason?: Database["public"]["Enums"]["stock_movement_reason"]
                    p_notes?: string
                }
                Returns: Json
            }
        }
        Enums: {
            business_line: "car_wash" | "barbershop"
            ticket_item_type: "service" | "product"
            stock_movement_reason: "sale" | "adjustment" | "restock"
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database[keyof Database]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
