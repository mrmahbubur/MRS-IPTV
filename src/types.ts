export interface Channel {
  id: string;
  name: string;
  chineseName?: string;
  category: string;
  m3u8Url: string;
  embedUrl: string;
  status: 'live' | 'buffering' | 'offline';
  viewersCount: number;
  currentProgram: string;
  nextProgram: string;
  provider: string;
  mirrors?: string[];
  backupUrls?: string[];
  icon?: string;
  iconUrl?: string;
  logo?: string;
  number?: number;
  streamUrl?: string;
  streamType?: 'hls' | 'dash' | 'mp4';
  isLive?: boolean;
  liveVerified?: boolean;
  latencyMs?: number | null;
  kind?: string | null;
  audioLanguage?: string;
  favorite?: boolean;
  countries?: string[];
  regions?: string[];
  regionalOrder?: number;
  global?: boolean;
  accentColor?: string;
  resolution?: string;
  matchSnippet?: {
    teams?: string;
    score?: string;
    eventStage?: string;
    venue?: string;
    lastUpdated?: string;
    statusBadge?: string;
  };
}

export interface ChatMessage {
  id: string;
  username: string;
  avatarColor: string;
  text: string;
  timestamp: string;
  isUser?: boolean;
  badge?: 'VIP' | 'MOD' | 'FAN' | 'NONE';
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  duration: number;
}

export interface PaymentRequest {
  id: string;
  userType: 'bd' | 'international';
  mobile: string;
  email: string;
  packageMonths: 1 | 2 | 6 | 12;
  price: string;
  currency: 'BDT' | 'USD';
  paymentMethod: string;
  transactionId?: string;
  screenshotImage?: string;
  hasScreenshot?: boolean;
  notes?: string;
  createdAt: string;
  status: 'pending' | 'confirmed' | 'rejected';
  issuedCode?: string;
}

export interface ActivationCode {
  code: string;
  durationMonths: 1 | 2 | 6 | 12;
  description: string;
  isUsed?: boolean;
  usedByDevice?: string;
  usedAt?: string;
}

export interface AdFreeState {
  isActive: boolean;
  isAdFree?: boolean;
  code: string;
  deviceId: string;
  activatedAt: string;
  expiryDate: string;
  durationMonths: number;
  signature?: string;
}


export interface ReferralVisit {
  referredDeviceId: string;
  firstSeen: number;
  lastSeen: number;
  totalStaySeconds: number;
  purchasedVip: boolean;
  purchaseDate?: string;
  deviceType?: string;
  browser?: string;
}

export interface ReferralReward {
  id: string;
  referrerCode: string;
  referrerDeviceId: string;
  rewardType: '1_WEEK_VIP' | '1_MONTH_VIP';
  durationDays: number;
  grantedAt: string;
  expiryDate: string;
  reason: string;
  aiConfirmed: boolean;
  aiAuditSummary: string;
  status: 'active' | 'expired';
}

export interface ReferralStats {
  referralCode: string;
  deviceId: string;
  shareUrl: string;
  siteAddress?: string;
  aiTrackingId?: string;
  totalUniqueClicks: number;
  qualified30hUsersCount: number;
  vipPurchasesCount: number;
  activeVipReward: {
    isActive: boolean;
    rewardType?: '1_WEEK_VIP' | '1_MONTH_VIP';
    expiryDate?: string;
    daysRemaining?: number;
    aiConfirmed?: boolean;
    reason?: string;
  } | null;
  milestoneProgress: {
    targetDevices: number;
    currentDevices: number;
    target30h: number;
    current30h: number;
    targetVip: number;
    currentVip: number;
    isCompleted: boolean;
  };
  rewardHistory: ReferralReward[];
  recentVisits: Array<{
    deviceIdPreview: string;
    totalStayHours: number;
    purchasedVip: boolean;
    lastActiveText: string;
  }>;
  aiAuditVerdict: {
    status: 'verified' | 'monitoring' | 'pending';
    score: number;
    details: string;
  };
}

