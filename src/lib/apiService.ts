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
  
  // Use currently_banned (runtime active bans) for stats, not historical total
  return {
    totalBannedIPs: jails.reduce((sum, jail) => {
      const activeBans = jail.currently_banned ?? jail.bannedIPs.length ?? 0;
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
 * Toggle jail enabled/disabled
 */
export const toggleJail = async (jailName: string): Promise<boolean> => {
  try {
    // 1) Вземаме текущото състояние на jail-а
    const jail = await fetchJail(jailName);

    // 2) Избираме правилния endpoint според текущия enabled флаг
    const targetEnabled = !jail.enabled;
    const actionPath = targetEnabled ? 'enable' : 'disable';

    type ToggleResponse = {
      success: boolean;
      jail?: string;
      enabled?: boolean;
      message?: string;
      error?: string;
    };

    const response = await apiClient.post<ToggleResponse>(
      `/api/jails/${encodeURIComponent(jailName)}/${actionPath}`
    );

    if (!response.success) {
      // backend винаги връща error при неуспех – показваме го в UI
      throw new Error(response.error || response.message || 'Failed to toggle jail');
    }

    // Връщаме новия enabled статус (true ако вече е включен, false ако е изключен)
    return response.enabled ?? targetEnabled;
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

