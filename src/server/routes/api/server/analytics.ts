import { administratorMiddleware } from '@/server/middleware/administrator';
import { userMiddleware } from '@/server/middleware/user';
import { getMetricsPoints } from '@/lib/metrics';
import { queryTotals, queryUserStats } from '@/lib/stats';
import { db } from '@/lib/db';
import { users, files, urls, userSessions } from '@/lib/db/schema';
import { count, desc, eq, gte, sql } from 'drizzle-orm';
import typedPlugin from '@/server/typedPlugin';
import z from 'zod';

export const apiAnalyticsResponseSchema = z.object({
  overview: z.object({
    totalUsers: z.number(),
    totalFiles: z.number(),
    totalUrls: z.number(),
    totalStorage: z.number(),
    totalFileViews: z.number(),
    totalUrlViews: z.number(),
  }),
  storageTrend: z.array(
    z.object({
      date: z.string(),
      storage: z.number(),
      files: z.number(),
      users: z.number(),
    }),
  ),
  userActivity: z.array(
    z.object({
      username: z.string().nullable(),
      filesUploaded: z.number(),
      storageUsed: z.number(),
      fileViews: z.number(),
      urlsCreated: z.number(),
      urlViews: z.number(),
      lastActive: z.string().nullable(),
    }),
  ),
  fileTypeDistribution: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
      storage: z.number(),
    }),
  ),
  uploadPatterns: z.object({
    byHour: z.array(z.number()),
    byDay: z.array(
      z.object({
        day: z.string(),
        uploads: z.number(),
      }),
    ),
  }),
  topUsers: z.object({
    byStorage: z.array(
      z.object({
        username: z.string().nullable(),
        storage: z.number(),
        files: z.number(),
      }),
    ),
    byFiles: z.array(
      z.object({
        username: z.string().nullable(),
        files: z.number(),
        storage: z.number(),
      }),
    ),
    byViews: z.array(
      z.object({
        username: z.string().nullable(),
        views: z.number(),
        files: z.number(),
      }),
    ),
  }),
});

export type ApiAnalyticsResponse = z.infer<typeof apiAnalyticsResponseSchema>;

export const PATH = '/api/server/analytics';

export default typedPlugin(
  async (server) => {
    server.get(
      PATH,
      {
        schema: {
          description: 'Get detailed analytics for admin dashboard',
          querystring: z.object({
            days: z.coerce.number().int().min(1).max(365).default(30),
          }),
          response: {
            200: apiAnalyticsResponseSchema,
          },
          tags: ['auth', 'admin'],
        },
        preHandler: [userMiddleware, administratorMiddleware],
      },
      async (req, res) => {
        const { days = 30 } = req.query;
        const fromDate = new Date(Date.now() - days * 86400000);
        const toDate = new Date();

        const [
          totals,
          metricsPoints,
          _userStats,
          fileTypes,
          uploadsByHour,
          uploadsByDay,
          topUsers,
          userCount,
        ] = await Promise.all([
          queryTotals(),
          getMetricsPoints(fromDate, toDate),
          getAllUserStats(),
          getFileTypeDistribution(),
          getUploadsByHour(days),
          getUploadsByDay(days),
          getTopUsers(),
          db.$count(users),
        ]);

        const storageTrend = metricsPoints
          .filter((p) => p.storage !== null)
          .map((p) => ({
            date: p.createdAt.toISOString().split('T')[0],
            storage: Number(p.storage),
            files: p.files,
            users: p.users,
          }));

        const userActivity = await getAllUserStats();

        return res.send({
          overview: {
            totalUsers: userCount,
            totalFiles: totals.files,
            totalUrls: totals.urls,
            totalStorage: totals.storage,
            totalFileViews: totals.fileViews,
            totalUrlViews: totals.urlViews,
          },
          storageTrend,
          userActivity,
          fileTypeDistribution: fileTypes,
          uploadPatterns: {
            byHour: uploadsByHour,
            byDay: uploadsByDay,
          },
          topUsers,
        });
      },
    );
  },
  { name: PATH },
);

async function getAllUserStats() {
  const allUsers = await db.select({ id: users.id, username: users.username }).from(users);

  const stats = await Promise.all(
    allUsers.map(async (user) => {
      const userStats = await queryUserStats(user.id);
      const lastFile = await db
        .select({ createdAt: files.createdAt })
        .from(files)
        .where(eq(files.userId, user.id))
        .orderBy(desc(files.createdAt))
        .limit(1);
      const lastUrl = await db
        .select({ createdAt: urls.createdAt })
        .from(urls)
        .where(eq(urls.userId, user.id))
        .orderBy(desc(urls.createdAt))
        .limit(1);
      const lastSession = await db
        .select({ createdAt: userSessions.createdAt })
        .from(userSessions)
        .where(eq(userSessions.userId, user.id))
        .orderBy(desc(userSessions.createdAt))
        .limit(1);

      const lastActive = [lastFile[0]?.createdAt, lastUrl[0]?.createdAt, lastSession[0]?.createdAt]
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

      return {
        username: user.username,
        filesUploaded: userStats.filesUploaded,
        storageUsed: userStats.storageUsed,
        fileViews: userStats.views,
        urlsCreated: userStats.urlsCreated,
        urlViews: userStats.urlViews,
        lastActive: lastActive?.toISOString() ?? null,
      };
    }),
  );

  return stats;
}

async function getFileTypeDistribution() {
  const rows = await db
    .select({
      type: files.type,
      count: count(),
      storage: sql<number>`coalesce(sum(${files.size}), 0)`.mapWith(Number),
    })
    .from(files)
    .groupBy(files.type)
    .orderBy(desc(count()));

  return rows.map((r) => ({ type: r.type, count: r.count, storage: r.storage }));
}

async function getUploadsByHour(days: number) {
  const fromDate = new Date(Date.now() - days * 86400000);
  const rows = await db
    .select({
      hour: sql<number>`extract(hour from ${files.createdAt})::int`,
      count: count(),
    })
    .from(files)
    .where(gte(files.createdAt, fromDate))
    .groupBy(sql`extract(hour from ${files.createdAt})`)
    .orderBy(sql`extract(hour from ${files.createdAt})`);

  const byHour = Array.from({ length: 24 }, () => 0);
  for (const row of rows) {
    byHour[row.hour] = row.count;
  }
  return byHour;
}

async function getUploadsByDay(days: number) {
  const fromDate = new Date(Date.now() - days * 86400000);
  const rows = await db
    .select({
      day: sql<string>`date(${files.createdAt})`,
      count: count(),
    })
    .from(files)
    .where(gte(files.createdAt, fromDate))
    .groupBy(sql`date(${files.createdAt})`)
    .orderBy(sql`date(${files.createdAt})`);

  return rows.map((r) => ({ day: r.day, uploads: r.count }));
}

async function getTopUsers(limit: number = 10) {
  const [byStorage, byFiles, byViews] = await Promise.all([
    db
      .select({
        username: users.username,
        storage: sql<number>`coalesce(sum(${files.size}), 0)`.mapWith(Number),
        files: count(),
      })
      .from(files)
      .leftJoin(users, eq(files.userId, users.id))
      .groupBy(files.userId, users.username)
      .orderBy(desc(sql`coalesce(sum(${files.size}), 0)`))
      .limit(limit),
    db
      .select({
        username: users.username,
        files: count(),
        storage: sql<number>`coalesce(sum(${files.size}), 0)`.mapWith(Number),
      })
      .from(files)
      .leftJoin(users, eq(files.userId, users.id))
      .groupBy(files.userId, users.username)
      .orderBy(desc(count()))
      .limit(limit),
    db
      .select({
        username: users.username,
        views: sql<number>`coalesce(sum(${files.views}), 0)`.mapWith(Number),
        files: count(),
      })
      .from(files)
      .leftJoin(users, eq(files.userId, users.id))
      .groupBy(files.userId, users.username)
      .orderBy(desc(sql`coalesce(sum(${files.views}), 0)`))
      .limit(limit),
  ]);

  return { byStorage, byFiles, byViews };
}
