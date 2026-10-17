/** Explicit, private dashboard projections for the additive rollout stages.
 * A missing optional column must never discard unrelated mode or creator fields.
 * The final projection is compatibility with the pre-commerce production schema.
 */
export const businessProjections = {
  orders: [
    'id,created_at,total_amount,status,storefront,payment_mode,is_test',
    'id,created_at,total_amount,status,storefront,is_test',
    'id,created_at,total_amount,status',
  ],
  items: [
    'id,order_id,product_id,quantity,unit_price,creator_id,fulfillment_status,name_snapshot:product_name,earnings_creator_id,earnings_review_required,line_discount_amount,commission_amount,creator_earning_paise',
    'id,order_id,product_id,quantity,unit_price,creator_id,fulfillment_status,name_snapshot:product_name,creator_earning_paise',
    'id,order_id,product_id,quantity,unit_price,creator_id,fulfillment_status,creator_earning_paise',
    'id,order_id,product_id,quantity,unit_price',
  ],
  products: ['id,name,stock,price,is_active,creator_id,commerce','id,name,stock,price,is_active'],
} as const;

export function missingColumn(error: { code?: string }): boolean {
  // 42703 = PostgreSQL undefined_column; PGRST204 = a column absent from schema cache.
  // Do not hide permission, connection, policy, missing-table or other server failures.
  return error.code === '42703' || error.code === 'PGRST204';
}
