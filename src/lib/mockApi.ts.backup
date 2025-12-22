import { Jail, JailsResponse, JailStats, BannedIP } from "@/types/jail";

// Generate random IP addresses
const generateRandomIP = (): string => {
  return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
};

// Generate random banned IPs
const generateBannedIPs = (count: number): BannedIP[] => {
  return Array.from({ length: count }, () => ({
    ip: generateRandomIP(),
    bannedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    banCount: Math.floor(Math.random() * 10) + 1,
  }));
};

// Mock jail data - dynamic and realistic
const generateMockJails = (): Jail[] => {
  const jailTemplates = [
    { name: "sshd", category: "SSH", enabled: true, ipCount: 12 },
    { name: "sshd-aggressive", category: "SSH", enabled: true, ipCount: 8 },
    { name: "apache-auth", category: "Web", enabled: true, ipCount: 5 },
    { name: "apache-badbots", category: "Web", enabled: true, ipCount: 23 },
    { name: "apache-noscript", category: "Web", enabled: false, ipCount: 0 },
    { name: "nginx-http-auth", category: "Web", enabled: true, ipCount: 3 },
    { name: "nginx-botsearch", category: "Web", enabled: true, ipCount: 15 },
    { name: "postfix", category: "Mail", enabled: true, ipCount: 7 },
    { name: "postfix-sasl", category: "Mail", enabled: true, ipCount: 4 },
    { name: "dovecot", category: "Mail", enabled: false, ipCount: 0 },
    { name: "mysqld-auth", category: "Database", enabled: true, ipCount: 2 },
    { name: "recidive", category: "System", enabled: true, ipCount: 6 },
    { name: "pam-generic", category: "System", enabled: true, ipCount: 1 },
  ];

  return jailTemplates.map((template) => ({
    name: template.name,
    enabled: template.enabled,
    bannedIPs: generateBannedIPs(template.ipCount + Math.floor(Math.random() * 5)),
    category: template.category,
    filter: template.name,
    maxRetry: Math.floor(Math.random() * 5) + 3,
    banTime: [600, 3600, 86400, 604800][Math.floor(Math.random() * 4)],
  }));
};

let cachedJails: Jail[] = generateMockJails();

// Simulate API delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch all jails
export const fetchJails = async (): Promise<JailsResponse> => {
  await delay(300 + Math.random() * 200);
  
  // Occasionally add/remove random IPs to simulate activity
  cachedJails = cachedJails.map((jail) => {
    if (jail.enabled && Math.random() > 0.8) {
      const action = Math.random() > 0.5 ? "add" : "remove";
      if (action === "add") {
        return {
          ...jail,
          bannedIPs: [...jail.bannedIPs, ...generateBannedIPs(1)],
        };
      } else if (jail.bannedIPs.length > 0) {
        return {
          ...jail,
          bannedIPs: jail.bannedIPs.slice(1),
        };
      }
    }
    return jail;
  });

  return {
    jails: cachedJails,
    lastUpdated: new Date().toISOString(),
    serverStatus: "online",
  };
};

// Calculate stats from jails
export const calculateStats = (jails: Jail[]): JailStats => {
  const categories = [...new Set(jails.map((j) => j.category || "Other"))];
  
  return {
    totalBannedIPs: jails.reduce((sum, jail) => sum + jail.bannedIPs.length, 0),
    activeJails: jails.length,
    enabledJails: jails.filter((j) => j.enabled).length,
    disabledJails: jails.filter((j) => !j.enabled).length,
    categories,
  };
};

// Unban an IP from a jail
export const unbanIP = async (jailName: string, ip: string): Promise<boolean> => {
  await delay(500);
  
  cachedJails = cachedJails.map((jail) => {
    if (jail.name === jailName) {
      return {
        ...jail,
        bannedIPs: jail.bannedIPs.filter((banned) => banned.ip !== ip),
      };
    }
    return jail;
  });

  return true;
};

// Toggle jail enabled/disabled
export const toggleJail = async (jailName: string): Promise<boolean> => {
  await delay(300);
  
  cachedJails = cachedJails.map((jail) => {
    if (jail.name === jailName) {
      return { ...jail, enabled: !jail.enabled };
    }
    return jail;
  });

  return true;
};

// Ban a new IP (for testing)
export const banIP = async (jailName: string, ip: string): Promise<boolean> => {
  await delay(300);
  
  cachedJails = cachedJails.map((jail) => {
    if (jail.name === jailName) {
      return {
        ...jail,
        bannedIPs: [
          ...jail.bannedIPs,
          { ip, bannedAt: new Date().toISOString(), banCount: 1 },
        ],
      };
    }
    return jail;
  });

  return true;
};
