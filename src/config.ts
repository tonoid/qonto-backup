import path from "node:path";

export interface Config {
  login: string;
  secretKey: string;
  backupDir: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = "https://thirdparty.qonto.com/v2/";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const login = required(env, "QONTO_LOGIN");
  const secretKey = required(env, "QONTO_SECRET_KEY");
  const backupDir = path.resolve(env.BACKUP_DIR ?? "./backup");
  const baseUrl = (env.QONTO_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/?$/, "/");
  return { login, secretKey, backupDir, baseUrl };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value.trim();
}
