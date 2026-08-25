import type { ConnectionOptions } from 'bullmq';

export function createBullConnectionOptions(
  redisUrl: string,
): ConnectionOptions {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('BullMQ requires a Redis connection URL.');
  }
  const databasePath = url.pathname.replace(/^\//, '');
  const database = databasePath === '' ? 0 : Number(databasePath);
  if (!Number.isInteger(database) || database < 0) {
    throw new Error('Redis database number is invalid.');
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    db: database,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    enableReadyCheck: true,
  };
}
