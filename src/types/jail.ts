export interface BannedIP {
  ip: string;
  bannedAt: string;
  banCount: number;
}

export interface Jail {
  name: string;
  enabled: boolean;
  bannedIPs: BannedIP[];
  // Explicit semantics for ban counts
  currently_banned?: number; // Runtime active bans (source of truth for UI)
  total_banned?: number; // Historical total (optional, informational)
  // Backward compatibility
  banned_count?: number; // Deprecated: use currently_banned
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
