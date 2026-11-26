import { ApiError } from '@/lib/api/errors';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { datasource } from '@/lib/datasource';
import typedPlugin from '@/server/typedPlugin';
import { sql } from 'drizzle-orm';
import z from 'zod';
import { statfs } from 'node:fs/promises';
import { config as appConfig } from '@/lib/config';

export type ApiHealthcheckResponse = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthCheck>;
  timestamp: string;
  uptime: number;
};

export type HealthCheck = {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  durationMs: number;
  componentType?: 'database' | 'storage' | 'system';
};

export const PATH = '/api/healthcheck';

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return {
      status: 'pass',
      durationMs: Date.now() - start,
      componentType: 'database',
    };
  } catch (error) {
    void error; // suppress unused warning
    return {
      status: 'fail',
      message: 'Database connection failed',
      durationMs: Date.now() - start,
      componentType: 'database',
    };
  }
}

async function checkStorage(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    if (!datasource) {
      return {
        status: 'warn',
        message: 'Datasource not initialized',
        durationMs: Date.now() - start,
        componentType: 'storage',
      };
    }
    // Test storage by checking if we can access it (size will throw if not accessible)
    await datasource.size('healthcheck-test');
    return {
      status: 'pass',
      durationMs: Date.now() - start,
      componentType: 'storage',
    };
  } catch (e) {
    // Storage might not have the test file, but that's OK - we just need to verify connectivity
    if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'ENOENT') {
      return {
        status: 'pass',
        durationMs: Date.now() - start,
        componentType: 'storage',
      };
    }
    return {
      status: 'fail',
      message: 'Storage backend unavailable',
      durationMs: Date.now() - start,
      componentType: 'storage',
    };
  }
}

async function checkDiskSpace(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const uploadsDir = appConfig.datasource.local?.directory || '/zipline/uploads';
    const stats = await statfs(uploadsDir);
    const freeBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    const usedPercent = ((totalBytes - freeBytes) / totalBytes) * 100;

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message: string | undefined;
    if (usedPercent > 95) {
      status = 'fail';
      message = `Disk usage critical: ${usedPercent.toFixed(1)}%`;
    } else if (usedPercent > 85) {
      status = 'warn';
      message = `Disk usage high: ${usedPercent.toFixed(1)}%`;
    }

    return {
      status,
      message,
      durationMs: Date.now() - start,
      componentType: 'system',
    };
  } catch (error) {
    void error; // suppress unused warning
    return {
      status: 'warn',
      message: 'Could not check disk space',
      durationMs: Date.now() - start,
      componentType: 'system',
    };
  }
}

export default typedPlugin(
  async (server) => {
    server.get(
      PATH,
      {
        schema: {
          description:
            'Perform a comprehensive healthcheck on the database, storage, and system. Returns detailed component status.',
          response: {
            200: z.object({
              status: z.enum(['healthy', 'degraded', 'unhealthy']),
              checks: z.record(
                z.string(),
                z.object({
                  status: z.enum(['pass', 'warn', 'fail']),
                  message: z.string().optional(),
                  durationMs: z.number(),
                  componentType: z.enum(['database', 'storage', 'system']).optional(),
                }),
              ),
              timestamp: z.string(),
              uptime: z.number(),
            }),
          },
        },
      },
      async (_, res) => {
        if (!config.features.healthcheck) throw new ApiError(9002);

        const [dbCheck, storageCheck, diskCheck] = await Promise.all([
          checkDatabase(),
          checkStorage(),
          checkDiskSpace(),
        ]);

        const checks = {
          database: dbCheck,
          storage: storageCheck,
          disk: diskCheck,
        };

        const failed = Object.values(checks).filter((c) => c.status === 'fail').length;
        const warned = Object.values(checks).filter((c) => c.status === 'warn').length;

        let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        if (failed > 0) overallStatus = 'unhealthy';
        else if (warned > 0) overallStatus = 'degraded';

        return res.send({
          status: overallStatus,
          checks,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      },
    );

    // Kubernetes-style live probe - lightweight, only checks if process is running
    server.get(
      '/api/healthcheck/live',
      {
        schema: {
          description: 'Liveness probe - checks if the process is alive',
          response: {
            200: z.object({
              status: z.literal('alive'),
              timestamp: z.string(),
              uptime: z.number(),
            }),
          },
        },
      },
      async (_, res) => {
        return res.send({
          status: 'alive',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      },
    );

    // Kubernetes-style ready probe - checks if ready to serve traffic
    server.get(
      '/api/healthcheck/ready',
      {
        schema: {
          description: 'Readiness probe - checks if ready to serve traffic (DB + storage)',
          response: {
            200: z.object({
              status: z.enum(['ready', 'not-ready']),
              checks: z.record(
                z.string(),
                z.object({
                  status: z.enum(['pass', 'warn', 'fail']),
                  message: z.string().optional(),
                  durationMs: z.number(),
                }),
              ),
              timestamp: z.string(),
            }),
            503: z.object({
              status: z.literal('not-ready'),
              checks: z.record(
                z.string(),
                z.object({
                  status: z.enum(['pass', 'warn', 'fail']),
                  message: z.string().optional(),
                  durationMs: z.number(),
                }),
              ),
              timestamp: z.string(),
            }),
          },
        },
      },
      async (_, res) => {
        const [dbCheck, storageCheck] = await Promise.all([checkDatabase(), checkStorage()]);

        const checks = {
          database: { status: dbCheck.status, message: dbCheck.message, durationMs: dbCheck.durationMs },
          storage: {
            status: storageCheck.status,
            message: storageCheck.message,
            durationMs: storageCheck.durationMs,
          },
        };

        const failed = Object.values(checks).filter((c) => c.status === 'fail').length;
        const ready = failed === 0;

        if (ready) {
          return res.send({
            status: 'ready',
            checks,
            timestamp: new Date().toISOString(),
          });
        } else {
          return res.status(503).send({
            status: 'not-ready',
            checks,
            timestamp: new Date().toISOString(),
          });
        }
      },
    );
  },
  { name: PATH },
);
