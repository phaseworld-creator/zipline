import dayjs from 'dayjs';
import { AreaChart, ChartTooltip } from '@mantine/charts';
import { Paper, Title, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface StorageTrendProps {
  data: Array<{ date: string; storage: number; files: number; users: number }>;
}

export function StorageTrend({ data }: StorageTrendProps) {
  const { t } = useTranslation('serverActions');

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!data.length) {
    return (
      <Paper withBorder p='md'>
        <Title order={4}>{t('admin.analytics.storageTrend')}</Title>
        <Text size='sm' c='dimmed' mt='md' ta='center'>
          {t('admin.analytics.noData')}
        </Text>
      </Paper>
    );
  }

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        storage: d.storage,
        files: d.files,
      })),
    [data],
  );

  return (
    <Paper withBorder p='md' style={{ height: 300 }}>
      <Title order={4} mb='md'>
        {t('admin.analytics.storageTrend')}
      </Title>
      <AreaChart
        data={chartData}
        dataKey='date'
        series={[
          {
            name: 'storage',
            label: t('admin.analytics.storage'),
            color: 'orange',
          },
          {
            name: 'files',
            label: t('admin.analytics.files'),
            color: 'violet',
          },
        ]}
        valueFormatter={(v) => formatBytes(Number(v))}
        xAxisProps={{
          tickFormatter: (value: string) => dayjs(value).format('MMM DD'),
        }}
        tooltipProps={{
          content: ({ label, payload }) => (
            <ChartTooltip
              label={dayjs(label).format('MMMM DD, YYYY')}
              payload={payload}
              valueFormatter={(v) => formatBytes(Number(v))}
              series={[
                { name: 'storage', label: t('admin.analytics.storage') },
                { name: 'files', label: t('admin.analytics.files') },
              ]}
            />
          ),
        }}
        withLegend
        opacity={0.3}
        areaProps={{ strokeWidth: 2 }}
      />
    </Paper>
  );
}
