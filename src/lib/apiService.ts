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
 * POST /api/unban
 */
export interface UnbanResponse {
  success: boolean;
  message?: string;
  jail?: string;
  ip?: string;
  error?: string;
}

export const unbanIP = async (jailName: string, ip: string): Promise<UnbanResponse> => {
  try {
    const response = await apiClient.post<UnbanResponse>('/api/bans/unban', {
      jail: jailName,
      ip: ip,
    });
    if (!response.success) {
      throw new Error(response.error || 'Failed to unban IP');
    }
    return response;
  } catch (error) {
    console.error('Unban IP failed:', error);
    throw error;
  }
};

/**
 * Start a jail
 * POST /api/jails/:name/start
 */
export const startJail = async (jailName: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/api/jails/${encodeURIComponent(jailName)}/start`
    );
    return response;
  } catch (error) {
    console.error('Start jail failed:', error);
    throw error;
  }
};

/**
 * Stop a jail
 * POST /api/jails/:name/stop
 */
export const stopJail = async (jailName: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/api/jails/${encodeURIComponent(jailName)}/stop`
    );
    return response;
  } catch (error) {
    console.error('Stop jail failed:', error);
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
 * POST /api/fail2ban/restart or POST /api/system/restart
 */
export interface RestartFail2banResponse {
  success: boolean;
  message?: string;
  error?: string;
  timestamp: string;
}

export const restartFail2ban = async (): Promise<RestartFail2banResponse> => {
  try {
    const response = await apiClient.post<RestartFail2banResponse>('/api/system/restart');
    return response;
  } catch (error) {
    console.error('Restart fail2ban failed:', error);
    throw error;
  }
};

/**
 * Fetch active bans
 * GET /api/bans
 */
export interface ActiveBan {
  jail: string;
  ip: string;
  timeofban: number;
  bantime: number;
}

export interface ActiveBansResponse {
  success: boolean;
  bans: ActiveBan[];
  total: number;
  lastUpdated: string;
  error?: string;
}

export const fetchActiveBans = async (): Promise<ActiveBansResponse> => {
  try {
    const response = await apiClient.get<ActiveBansResponse>('/api/bans');
    return response;
  } catch (error) {
    console.error('Fetch active bans failed:', error);
    throw error;
  }
};

/**
 * Fetch ban history from fail2ban.log
 * GET /api/bans/history?jail=<name>&limit=50
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
    // Use new endpoint, fallback to old one for backward compatibility
    const url = `/api/bans/history${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.get<BanHistoryResponse>(url);
    return response;
  } catch (error) {
    // Fallback to old endpoint
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
    } catch (fallbackError) {
      console.error('Fetch ban history failed:', fallbackError);
      throw fallbackError;
    }
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

/**
 * Read jail configuration
 * GET /api/jail-config/:name
 */
export interface JailConfigResponse {
  success: boolean;
  jail: string;
  content: string;
  path: string;
}

export const readJailConfig = async (jailName: string): Promise<JailConfigResponse> => {
  try {
    const response = await apiClient.get<JailConfigResponse>(
      `/api/jail-config/${encodeURIComponent(jailName)}`
    );
    return response;
  } catch (error) {
    console.error('Read jail config failed:', error);
    throw error;
  }
};

/**
 * Write jail configuration
 * POST /api/jail-config/:name
 */
export interface WriteJailConfigPayload {
  content: string;
}

export interface WriteJailConfigResponse {
  success: boolean;
  message: string;
  path: string;
}

export const writeJailConfig = async (
  jailName: string,
  content: string,
  targetPath?: string
): Promise<WriteJailConfigResponse> => {
  try {
    const response = await apiClient.post<WriteJailConfigResponse>(
      `/api/jail-config/${encodeURIComponent(jailName)}`,
      { content, targetPath }
    );
    return response;
  } catch (error) {
    console.error('Write jail config failed:', error);
    throw error;
  }
};

/**
 * Server Management API
 */

export interface Server {
  id: string;
  name: string;
  ip: string | null;
  lastSeen: number;
  createdAt: number;
  bans?: number;
  online?: boolean;
  jails?: Array<{ name: string; enabled: boolean; bans: number }>;
  logTail?: string[];
}

export interface ServersResponse {
  success: boolean;
  servers: Server[];
  count: number;
}

export interface ServerResponse {
  success: boolean;
  server: Server;
}

/**
 * Fetch all servers
 * GET /api/servers
 */
export const fetchServers = async (): Promise<ServersResponse> => {
  const response = await apiClient.get<ServersResponse>('/api/servers');
  return response;
};

/**
 * Fetch server details
 * GET /api/servers/:id
 */
export const fetchServer = async (id: string): Promise<ServerResponse> => {
  const response = await apiClient.get<ServerResponse>(`/api/servers/${encodeURIComponent(id)}`);
  return response;
};

/**
 * Unban IP on server
 * POST /api/servers/:id/unban
 */
export const unbanServerIP = async (
  serverId: string,
  jail: string,
  ip: string
): Promise<{ success: boolean; jail: string; ip: string; message: string }> => {
  const response = await apiClient.post<{ success: boolean; jail: string; ip: string; message: string }>(
    `/api/servers/${encodeURIComponent(serverId)}/unban`,
    { jail, ip }
  );
  return response;
};

/**
 * Execute action on server
 * POST /api/servers/:id/action
 */
export const executeServerAction = async (
  serverId: string,
  action: 'start' | 'stop' | 'restart' | 'restart_fail2ban',
  jailName?: string
): Promise<{ success: boolean; action: string; jail?: string; message: string }> => {
  const response = await apiClient.post<{ success: boolean; action: string; jail?: string; message: string }>(
    `/api/servers/${encodeURIComponent(serverId)}/action`,
    { action, jailName }
  );
  return response;
};

