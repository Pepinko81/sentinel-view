export interface BannedIP {
  ip: string;
  bannedAt: string;
  banCount: number;
}

export interface Jail {
  name: string;
  enabled: boolean;
  configured?: boolean; // Always true for jails from API
  status?: 'ENABLED' | 'DISABLED'; // Explicit status field
  bannedIPs: BannedIP[];
  banned_ips?: string[]; // Raw IP addresses from fail2ban
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
