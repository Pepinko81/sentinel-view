export interface BannedIP {
  ip: string;
  bannedAt: string;
  banCount: number;
}

export interface Jail {
  name: string;
  enabled: boolean;
  bannedIPs: BannedIP[];
  category?: string;
  filter?: string;
  maxRetry?: number;
  banTime?: number;
}

export interface JailsResponse {
  jails: Jail[];
  lastUpdated: string;
  serverStatus: 'online' | 'offline';
}

export interface JailStats {
  totalBannedIPs: number;
  activeJails: number;
  enabledJails: number;
  disabledJails: number;
  categories: string[];
}
