export type Creator = {
  id: string; user_id: string | null; email: string; display_name: string; bio: string; capacity: number | null;
  status: 'invited' | 'active' | 'suspended'; commission_bps: number; created_at: string;
  photo_url?: string | null; profession?: string | null; profile_published?: boolean;
};
export type CreatorSubmission = {
  id: string; creator_id: string; product_id: string | null; title: string;
  proposed_price: number; details: Record<string, unknown>;
  status: 'submitted' | 'approved' | 'rejected'; owner_note: string | null; kind?: 'new_product' | 'revision';
  created_at: string; updated_at: string;
};
export type FulfillmentStatus = 'assigned' | 'accepted' | 'preparing' | 'ready' | 'dispatched';
export type CreatorFulfillment = {
  id: string; creator_id: string; order_id: string; order_item_id: string;
  product_name: string; quantity: number; requirements: Record<string, unknown>;
  status: FulfillmentStatus; tracking_code: string | null; tracking_url: string | null;
  shipping_address: Record<string, unknown>; creator_earning_paise?: number | null; earnings_review_required?: boolean; is_test?: boolean; created_at: string; updated_at: string;
};
export type CreatorSettlement = {
  id: string; creator_id: string; amount_paise: number; status: 'pending' | 'approved' | 'paid';
  note: string | null; period_start: string | null; period_end: string | null; created_at: string; approved_at?: string | null;
  paid_on?: string | null; payment_reference?: string | null; lines?: unknown[] | null;
};
export type CreatorPortalData = {
  creator: Creator; submissions: CreatorSubmission[]; fulfillment: CreatorFulfillment[];
  settlements: CreatorSettlement[]; sandbox: boolean;
};
export const fulfillmentNext: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  assigned: 'accepted', accepted: 'preparing', preparing: 'ready', ready: 'dispatched',
};
export const fulfillmentLabel: Record<FulfillmentStatus, string> = {
  assigned: 'Awaiting acceptance', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready to dispatch', dispatched: 'Dispatched',
};
