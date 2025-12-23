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
  
  // STRICT API CONTRACT: Clear separation of active vs historical bans
  active_bans: {
    count: number; // ONLY from "Currently banned" (runtime state)
    ips: string[]; // ONLY from "Banned IP list" (runtime state)
  };
  
  historical_bans: {
    total: number | null; // ONLY from "Total banned" (historical, optional)
  };
  
  // Backward compatibility aliases (deprecated - use active_bans instead)
  bannedIPs?: BannedIP[];
  banned_ips?: string[];
  currently_banned?: number;
  total_banned?: number;
  banned_count?: number;
  
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
