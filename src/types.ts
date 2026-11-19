export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'super_admin' | 'support';
  credits: number;
  pack_expires_at: string | null;
  email_verified: number;
  save_to_gallery_default?: number;
}

export interface Look {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  thumbnail_url: string;
  is_featured: number;
  sort_order: number;
  usage_count: number;
  prompt?: string;
  is_active?: number;
}

export interface PublicSettings {
  brandName: string;
  supportEmail: string;
  legalEntityName?: string;
  legalJurisdiction?: string;
  singlePriceUsd: number;
  packPriceUsd: number;
  packSize: number;
  packValidityDays: number;
  freePreviewLimit: number;
  maxUploadMb?: number;
  checkoutCurrency?: string;
  razorpayCheckoutName?: string;
  razorpayThemeColor?: string;
  maintenanceMode: boolean;
  razorpayConfigured: boolean;
}

export interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
}

export interface CheckoutRequest {
  planType: 'single' | 'pack_12';
  generationId?: string;
  onSuccess?: () => void;
}
