/**
 * API Service
 * Service functions for backend API endpoints
 * Replaces mockApi.ts functions with real API calls
 */

import { apiClient } from './api';
import { Jail, JailsResponse, JailStats, BannedIP } from '@/types/jail';

/**
 * Calculate stats from jails array
 * (Keep this utility function as it's used by hooks)
 */
export const calculateStats = (jails: Jail[]): JailStats => {
  const categories = [...new Set(jails.map((j) => j.category || 'Other'))];
  
  // Use active_bans.count (runtime active bans) for stats, NOT historical total
  return {
    totalBannedIPs: jails.reduce((sum, jail) => {
      // Prefer new structure, fallback to backward compatibility
      const activeBans = jail.active_bans?.count ?? jail.currently_banned ?? jail.bannedIPs?.length ?? 0;
      return sum + activeBans;
    }, 0),
    activeJails: jails.length,
    enabledJails: jails.filter((j) => j.enabled).length,
    disabledJails: jails.filter((j) => !j.enabled).length,
    categories,
  };
};

/**
 * Fetch all jails
 * GET /api/jails
 */
export const fetchJails = async (): Promise<JailsResponse> => {
  const response = await apiClient.get<JailsResponse>('/api/jails');
  return response;
};

/**
 * Fetch single jail details
 * GET /api/jails/:name
 */
export const fetchJail = async (name: string): Promise<Jail> => {
  const response = await apiClient.get<Jail>(`/api/jails/${encodeURIComponent(name)}`);
  return response;
};

/**
 * Fetch overview data
 * GET /api/overview
 */
export interface OverviewResponse {
  timestamp: string;
  server: {
    hostname: string;
    uptime: string;
  };
  summary: {
    active_jails: number;
    total_banned_ips: number;
  };
  jails: Jail[];
  nginx: {
    '404_count': number;
    admin_scans: number;
    webdav_attacks: number;
    hidden_files_attempts: number;
  };
  system: {
    memory: string;
    disk: string;
    load: string;
  };
  _errors?: string[];
  _partial?: boolean;
  _serverStatus?: string;
}

export const fetchOverview = async (): Promise<OverviewResponse> => {
  const response = await apiClient.get<OverviewResponse>('/api/overview');
  return response;
};

/**
 * Fetch nginx statistics
 * GET /api/nginx
 */
export interface NginxStatsResponse {
  '404_count': number;
  admin_scans: number;
  webdav_attacks: number;
  hidden_files_attempts: number;
  _errors?: string[];
  _partial?: boolean;
}

export const fetchNginxStats = async (): Promise<NginxStatsResponse> => {
  const response = await apiClient.get<NginxStatsResponse>('/api/nginx');
  return response;
};

/**
 * Fetch system information
 * GET /api/system
 */
export interface SystemInfoResponse {
  hostname: string;
  uptime: string;
  memory: string;
  disk: string;
  load: string;
  _errors?: string[];
  _partial?: boolean;
}

export const fetchSystemInfo = async (): Promise<SystemInfoResponse> => {
  const response = await apiClient.get<SystemInfoResponse>('/api/system');
  return response;
};

/**
 * Trigger backup
 * POST /api/backup
 */
export interface BackupResponse {
  success: boolean;
  filename: string;
  path: string;
  size: number;
  sizeFormatted: string;
  timestamp: string;
  _errors?: string[];
  _partial?: boolean;
}

export const triggerBackup = async (): Promise<BackupResponse> => {
  const response = await apiClient.post<BackupResponse>('/api/backup');
  return response;
};

/**
 * Unban IP from jail
 * NOTE: This endpoint may not exist yet in backend
 * For now, this is a placeholder that will fail gracefully
 */
export const unbanIP = async (jailName: string, ip: string): Promise<boolean> => {
  try {
    // TODO: Implement when backend endpoint is available
    // await apiClient.post(`/api/jails/${encodeURIComponent(jailName)}/unban`, { ip });
    throw new Error('Unban endpoint not yet implemented in backend');
  } catch (error) {
    console.error('Unban IP failed:', error);
    throw error;
  }
};

/**
 * Toggle jail enabled/disabled (idempotent)
 * Uses the new toggle endpoint which handles NOK responses correctly
 */
export const toggleJail = async (jailName: string): Promise<boolean> => {
  try {
    type ToggleResponse = {
      success: boolean;
      jail?: string;
      enabled?: boolean;
      status?: 'ENABLED' | 'DISABLED';
      message?: string;
      error?: string;
      nokIgnored?: boolean;
    };

    const response = await apiClient.post<ToggleResponse>(
      `/api/jails/${encodeURIComponent(jailName)}/toggle`
    );

    if (!response.success) {
      // backend винаги връща error при неуспех – показваме го в UI
      throw new Error(response.error || response.message || 'Failed to toggle jail');
    }

    // Return the new enabled status
    return response.enabled ?? false;
  } catch (error) {
    console.error('Toggle jail failed:', error);
    throw error;
  }
};

/**
 * Ban IP in jail
 * NOTE: This endpoint may not exist yet in backend
 * For now, this is a placeholder that will fail gracefully
 */
export const banIP = async (jailName: string, ip: string): Promise<boolean> => {
  try {
    // TODO: Implement when backend endpoint is available
    // await apiClient.post(`/api/jails/${encodeURIComponent(jailName)}/ban`, { ip });
    throw new Error('Ban IP endpoint not yet implemented in backend');
  } catch (error) {
    console.error('Ban IP failed:', error);
    throw error;
  }
};

/**
 * Restart fail2ban service
 * POST /api/fail2ban/restart
 */
export interface RestartFail2banResponse {
  success: boolean;
  message?: string;
  error?: string;
  timestamp: string;
}

export const restartFail2ban = async (): Promise<RestartFail2banResponse> => {
  try {
    const response = await apiClient.post<RestartFail2banResponse>('/api/fail2ban/restart');
    return response;
  } catch (error) {
    console.error('Restart fail2ban failed:', error);
    throw error;
  }
};

/**
 * Fetch ban history from fail2ban.log
 * GET /api/history?jail=<name>&limit=50
 */
export interface BanHistoryEvent {
  jail: string;
  ip: string;
  action: "ban" | "unban" | "restore";
  timestamp: string;
}

export interface BanHistoryResponse {
  success: boolean;
  events: BanHistoryEvent[];
  total: number;
  jail: string | null;
  limit: number;
  error?: string;
}

export const fetchBanHistory = async (jail?: string, limit: number = 50): Promise<BanHistoryResponse> => {
  try {
    const params = new URLSearchParams();
    if (jail) {
      params.append('jail', jail);
    }
    if (limit) {
      params.append('limit', limit.toString());
    }
    const queryString = params.toString();
    const url = `/api/history${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.get<BanHistoryResponse>(url);
    return response;
  } catch (error) {
    console.error('Fetch ban history failed:', error);
    throw error;
  }
};

/**
 * Create a new fail2ban jail
 * POST /api/jails/create
 */
export interface CreateJailPayload {
  name: string;
  filter: string;
  logpath: string;
  maxretry?: number;
  findtime?: number;
  bantime?: number;
  action?: string;
}

export interface CreateJailResponse {
  success: boolean;
  jail: string;
  enabled?: boolean;
  message: string;
  configFile?: string;
  warning?: string;
  error?: string;
}

export const createJail = async (payload: CreateJailPayload): Promise<CreateJailResponse> => {
  try {
    const response = await apiClient.post<CreateJailResponse>('/api/jails/create', payload);
    if (!response.success) {
      throw new Error(response.error || 'Failed to create jail');
    }
    return response;
  } catch (error) {
    console.error('Create jail failed:', error);
    throw error;
  }
};

/**
 * Create a new fail2ban filter file
 * POST /api/filters/create
 */
export interface CreateFilterPayload {
  name: string;
  failregex: string;
  ignoreregex?: string;
}

export interface CreateFilterResponse {
  success: boolean;
  filter: string;
  filterPath?: string;
  message: string;
  warning?: string;
  error?: string;
}

export const createFilter = async (payload: CreateFilterPayload): Promise<CreateFilterResponse> => {
  try {
    const response = await apiClient.post<CreateFilterResponse>('/api/filters/create', payload);
    if (!response.success) {
      throw new Error(response.error || 'Failed to create filter');
    }
    return response;
  } catch (error) {
    console.error('Create filter failed:', error);
    throw error;
  }
};

