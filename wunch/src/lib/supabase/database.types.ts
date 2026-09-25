
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "closed_dates": {
                  Row: {
                    "closed_on": string,"created_at": string,"reason": string | null
                  }
                  Insert: {
                    "closed_on": string,"created_at"?: string,"reason"?: string | null
                  }
                  Update: {
                    "closed_on"?: string,"created_at"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"coupon_redemptions": {
                  Row: {
                    "coupon_id": string,"created_at": string,"discount_rappen": number,"id": string,"order_id": string,"released_at": string | null,"user_id": string | null
                  }
                  Insert: {
                    "coupon_id": string,"created_at"?: string,"discount_rappen": number,"id"?: string,"order_id": string,"released_at"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "coupon_id"?: string,"created_at"?: string,"discount_rappen"?: number,"id"?: string,"order_id"?: string,"released_at"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "coupon_redemptions_coupon_id_fkey"
      columns: ["coupon_id"]
isOneToOne: false
      referencedRelation: "coupons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coupon_redemptions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"coupons": {
                  Row: {
                    "amount_off_rappen": number | null,"archived_at": string | null,"code": string,"created_at": string,"first_order_only": boolean,"id": string,"is_active": boolean,"kind": string,"max_total_uses": number | null,"max_uses_per_customer": number | null,"min_order_rappen": number,"percent_off": number | null,"updated_at": string,"valid_from": string | null,"valid_to": string | null
                  }
                  Insert: {
                    "amount_off_rappen"?: number | null,"archived_at"?: string | null,"code": string,"created_at"?: string,"first_order_only"?: boolean,"id"?: string,"is_active"?: boolean,"kind": string,"max_total_uses"?: number | null,"max_uses_per_customer"?: number | null,"min_order_rappen"?: number,"percent_off"?: number | null,"updated_at"?: string,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Update: {
                    "amount_off_rappen"?: number | null,"archived_at"?: string | null,"code"?: string,"created_at"?: string,"first_order_only"?: boolean,"id"?: string,"is_active"?: boolean,"kind"?: string,"max_total_uses"?: number | null,"max_uses_per_customer"?: number | null,"min_order_rappen"?: number,"percent_off"?: number | null,"updated_at"?: string,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"delivery_slots": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"is_active": boolean,"max_orders": number | null,"starts_at": string
                  }
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"is_active"?: boolean,"max_orders"?: number | null,"starts_at": string
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"is_active"?: boolean,"max_orders"?: number | null,"starts_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"email_log": {
                  Row: {
                    "created_at": string,"dedupe_key": string | null,"error": string | null,"id": number,"locale": string,"order_id": string | null,"provider_id": string | null,"status": string,"template": string,"to_email": string
                  }
                  Insert: {
                    "created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: never,"locale": string,"order_id"?: string | null,"provider_id"?: string | null,"status": string,"template": string,"to_email": string
                  }
                  Update: {
                    "created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: never,"locale"?: string,"order_id"?: string | null,"provider_id"?: string | null,"status"?: string,"template"?: string,"to_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_log_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"meals": {
                  Row: {
                    "allergens": (string)[],"always_available": boolean,"archived_at": string | null,"category": string,"created_at": string,"daily_portion_limit": number | null,"description_de": string,"description_en": string,"dietary_tags": (string)[],"id": string,"image_path": string | null,"is_active": boolean,"name_de": string,"name_en": string,"price_rappen": number,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "allergens"?: (string)[],"always_available"?: boolean,"archived_at"?: string | null,"category"?: string,"created_at"?: string,"daily_portion_limit"?: number | null,"description_de"?: string,"description_en"?: string,"dietary_tags"?: (string)[],"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"name_de": string,"name_en": string,"price_rappen": number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "allergens"?: (string)[],"always_available"?: boolean,"archived_at"?: string | null,"category"?: string,"created_at"?: string,"daily_portion_limit"?: number | null,"description_de"?: string,"description_en"?: string,"dietary_tags"?: (string)[],"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"name_de"?: string,"name_en"?: string,"price_rappen"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"menu_days": {
                  Row: {
                    "created_at": string,"meal_id": string,"menu_date": string,"portion_limit": number | null,"portions_reserved": number,"source": string
                  }
                  Insert: {
                    "created_at"?: string,"meal_id": string,"menu_date": string,"portion_limit"?: number | null,"portions_reserved"?: number,"source"?: string
                  }
                  Update: {
                    "created_at"?: string,"meal_id"?: string,"menu_date"?: string,"portion_limit"?: number | null,"portions_reserved"?: number,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_days_meal_id_fkey"
      columns: ["meal_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id"]
    }
                  ]
                },"order_events": {
                  Row: {
                    "actor_id": string | null,"actor_label": string | null,"actor_type": string,"created_at": string,"data": NonNullable<Json>,"from_status": Database["public"]['Enums']["order_status"] | null,"id": number,"kind": string,"note": string | null,"order_id": string,"to_status": Database["public"]['Enums']["order_status"] | null
                  }
                  Insert: {
                    "actor_id"?: string | null,"actor_label"?: string | null,"actor_type": string,"created_at"?: string,"data"?: NonNullable<Json>,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: never,"kind"?: string,"note"?: string | null,"order_id": string,"to_status"?: Database["public"]['Enums']["order_status"] | null
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_label"?: string | null,"actor_type"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: never,"kind"?: string,"note"?: string | null,"order_id"?: string,"to_status"?: Database["public"]['Enums']["order_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "id": string,"line_total_rappen": number,"meal_id": string,"name_de": string,"name_en": string,"order_id": string,"quantity": number,"unit_price_rappen": number
                  }
                  Insert: {
                    "id"?: string,"line_total_rappen": number,"meal_id": string,"name_de": string,"name_en": string,"order_id": string,"quantity": number,"unit_price_rappen": number
                  }
                  Update: {
                    "id"?: string,"line_total_rappen"?: number,"meal_id"?: string,"name_de"?: string,"name_en"?: string,"order_id"?: string,"quantity"?: number,"unit_price_rappen"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_meal_id_fkey"
      columns: ["meal_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "accepted_at": string | null,"action_lock_until": string | null,"admin_reminded_at": string | null,"amount_captured_rappen": number,"amount_refunded_rappen": number,"authorized_at": string | null,"cancelled_at": string | null,"capture_before": string | null,"city": string,"company": string | null,"coupon_code": string | null,"coupon_id": string | null,"created_at": string,"customer_email": string,"customer_name": string,"delivered_at": string | null,"delivery_date": string,"delivery_fee_rappen": number,"delivery_note": string | null,"discount_rappen": number,"floor_room": string | null,"id": string,"locale": string,"order_number": number,"phone": string,"postcode": string,"reject_reason": string | null,"reservations_released_at": string | null,"slot_ends_at": string,"slot_id": string,"slot_starts_at": string,"status": Database["public"]['Enums']["order_status"],"street": string,"stripe_charge_id": string | null,"stripe_fee_rappen": number | null,"stripe_net_rappen": number | null,"stripe_payment_intent_id": string | null,"subtotal_rappen": number,"tip_percent": number | null,"tip_rappen": number,"total_rappen": number,"updated_at": string,"user_id": string | null,"vat_rappen": number,"vat_rate_bp": number
                  }
                  Insert: {
                    "accepted_at"?: string | null,"action_lock_until"?: string | null,"admin_reminded_at"?: string | null,"amount_captured_rappen"?: number,"amount_refunded_rappen"?: number,"authorized_at"?: string | null,"cancelled_at"?: string | null,"capture_before"?: string | null,"city": string,"company"?: string | null,"coupon_code"?: string | null,"coupon_id"?: string | null,"created_at"?: string,"customer_email": string,"customer_name": string,"delivered_at"?: string | null,"delivery_date": string,"delivery_fee_rappen"?: number,"delivery_note"?: string | null,"discount_rappen"?: number,"floor_room"?: string | null,"id"?: string,"locale"?: string,"order_number"?: never,"phone": string,"postcode": string,"reject_reason"?: string | null,"reservations_released_at"?: string | null,"slot_ends_at": string,"slot_id": string,"slot_starts_at": string,"status"?: Database["public"]['Enums']["order_status"],"street": string,"stripe_charge_id"?: string | null,"stripe_fee_rappen"?: number | null,"stripe_net_rappen"?: number | null,"stripe_payment_intent_id"?: string | null,"subtotal_rappen": number,"tip_percent"?: number | null,"tip_rappen"?: number,"total_rappen": number,"updated_at"?: string,"user_id"?: string | null,"vat_rappen"?: number,"vat_rate_bp"?: number
                  }
                  Update: {
                    "accepted_at"?: string | null,"action_lock_until"?: string | null,"admin_reminded_at"?: string | null,"amount_captured_rappen"?: number,"amount_refunded_rappen"?: number,"authorized_at"?: string | null,"cancelled_at"?: string | null,"capture_before"?: string | null,"city"?: string,"company"?: string | null,"coupon_code"?: string | null,"coupon_id"?: string | null,"created_at"?: string,"customer_email"?: string,"customer_name"?: string,"delivered_at"?: string | null,"delivery_date"?: string,"delivery_fee_rappen"?: number,"delivery_note"?: string | null,"discount_rappen"?: number,"floor_room"?: string | null,"id"?: string,"locale"?: string,"order_number"?: never,"phone"?: string,"postcode"?: string,"reject_reason"?: string | null,"reservations_released_at"?: string | null,"slot_ends_at"?: string,"slot_id"?: string,"slot_starts_at"?: string,"status"?: Database["public"]['Enums']["order_status"],"street"?: string,"stripe_charge_id"?: string | null,"stripe_fee_rappen"?: number | null,"stripe_net_rappen"?: number | null,"stripe_payment_intent_id"?: string | null,"subtotal_rappen"?: number,"tip_percent"?: number | null,"tip_rappen"?: number,"total_rappen"?: number,"updated_at"?: string,"user_id"?: string | null,"vat_rappen"?: number,"vat_rate_bp"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_coupon_id_fkey"
      columns: ["coupon_id"]
isOneToOne: false
      referencedRelation: "coupons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_slot_id_fkey"
      columns: ["slot_id"]
isOneToOne: false
      referencedRelation: "delivery_slots"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "city": string | null,"company": string | null,"created_at": string,"delivery_note": string | null,"email": string,"floor_room": string | null,"full_name": string | null,"id": string,"locale": string,"phone": string | null,"postcode": string | null,"role": string,"street": string | null,"updated_at": string
                  }
                  Insert: {
                    "city"?: string | null,"company"?: string | null,"created_at"?: string,"delivery_note"?: string | null,"email": string,"floor_room"?: string | null,"full_name"?: string | null,"id": string,"locale"?: string,"phone"?: string | null,"postcode"?: string | null,"role"?: string,"street"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "city"?: string | null,"company"?: string | null,"created_at"?: string,"delivery_note"?: string | null,"email"?: string,"floor_room"?: string | null,"full_name"?: string | null,"id"?: string,"locale"?: string,"phone"?: string | null,"postcode"?: string | null,"role"?: string,"street"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "business_address": string,"business_email": string | null,"business_name": string,"delivery_fee_rappen": number,"delivery_postcodes": (string)[],"delivery_weekdays": (number)[],"id": boolean,"max_days_ahead": number,"min_order_rappen": number,"notify_email": string | null,"same_day_cutoff": string,"tip_percentages": (number)[],"undecided_reminder_minutes": number,"updated_at": string,"vat_number": string | null,"vat_rate_bp": number
                  }
                  Insert: {
                    "business_address"?: string,"business_email"?: string | null,"business_name"?: string,"delivery_fee_rappen"?: number,"delivery_postcodes"?: (string)[],"delivery_weekdays"?: (number)[],"id"?: boolean,"max_days_ahead"?: number,"min_order_rappen"?: number,"notify_email"?: string | null,"same_day_cutoff"?: string,"tip_percentages"?: (number)[],"undecided_reminder_minutes"?: number,"updated_at"?: string,"vat_number"?: string | null,"vat_rate_bp"?: number
                  }
                  Update: {
                    "business_address"?: string,"business_email"?: string | null,"business_name"?: string,"delivery_fee_rappen"?: number,"delivery_postcodes"?: (string)[],"delivery_weekdays"?: (number)[],"id"?: boolean,"max_days_ahead"?: number,"min_order_rappen"?: number,"notify_email"?: string | null,"same_day_cutoff"?: string,"tip_percentages"?: (number)[],"undecided_reminder_minutes"?: number,"updated_at"?: string,"vat_number"?: string | null,"vat_rate_bp"?: number
                  }
                  Relationships: [
                    
                  ]
                },"stripe_events": {
                  Row: {
                    "error": string | null,"id": string,"livemode": boolean,"processed_at": string | null,"received_at": string,"stripe_created_at": string | null,"type": string
                  }
                  Insert: {
                    "error"?: string | null,"id": string,"livemode"?: boolean,"processed_at"?: string | null,"received_at"?: string,"stripe_created_at"?: string | null,"type": string
                  }
                  Update: {
                    "error"?: string | null,"id"?: string,"livemode"?: boolean,"processed_at"?: string | null,"received_at"?: string,"stripe_created_at"?: string | null,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_order_action":
{ Args: { "p_order_id": string,"p_seconds"?: number,"p_statuses": (Database["public"]['Enums']["order_status"])[] }; Returns: boolean
                           },
"create_order":
{ Args: { "p_amounts": Json,"p_coupon_id": string,"p_delivery_date": string,"p_details": Json,"p_items": Json,"p_locale": string,"p_slot_id": string,"p_user_id": string }; Returns: {
              "order_id": string,"order_number": number
            }[]
                           },
"cron_tick":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"order_status_is_live":
{ Args: { "s": Database["public"]['Enums']["order_status"] }; Returns: boolean
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"release_order_action":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"release_order_reservations":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"slot_order_counts":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "delivery_date": string,"order_count": number,"slot_id": string
            }[]
                           },
"transition_order":
{ Args: { "p_actor_id"?: string,"p_actor_label"?: string,"p_actor_type": string,"p_event_data"?: Json,"p_event_kind"?: string,"p_from": (Database["public"]['Enums']["order_status"])[],"p_note"?: string,"p_order_id": string,"p_patch"?: Json,"p_to": Database["public"]['Enums']["order_status"] }; Returns: {
              "accepted_at": string | null,
"action_lock_until": string | null,
"admin_reminded_at": string | null,
"amount_captured_rappen": number,
"amount_refunded_rappen": number,
"authorized_at": string | null,
"cancelled_at": string | null,
"capture_before": string | null,
"city": string,
"company": string | null,
"coupon_code": string | null,
"coupon_id": string | null,
"created_at": string,
"customer_email": string,
"customer_name": string,
"delivered_at": string | null,
"delivery_date": string,
"delivery_fee_rappen": number,
"delivery_note": string | null,
"discount_rappen": number,
"floor_room": string | null,
"id": string,
"locale": string,
"order_number": number,
"phone": string,
"postcode": string,
"reject_reason": string | null,
"reservations_released_at": string | null,
"slot_ends_at": string,
"slot_id": string,
"slot_starts_at": string,
"status": Database["public"]['Enums']["order_status"],
"street": string,
"stripe_charge_id": string | null,
"stripe_fee_rappen": number | null,
"stripe_net_rappen": number | null,
"stripe_payment_intent_id": string | null,
"subtotal_rappen": number,
"tip_percent": number | null,
"tip_rappen": number,
"total_rappen": number,
"updated_at": string,
"user_id": string | null,
"vat_rappen": number,
"vat_rate_bp": number
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "order_status": "pending_payment"|"new"|"accepted"|"delivered"|"rejected"|"auto_cancelled"|"payment_failed"|"expired"|"refunded"|"partially_refunded"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "order_status": ["pending_payment", "new", "accepted", "delivered", "rejected", "auto_cancelled", "payment_failed", "expired", "refunded", "partially_refunded"]
          }
        }
} as const

