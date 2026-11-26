import { PieChart, ChartTooltip } from '@mantine/charts';
import { Paper, Title, Group, Text, Box } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface FileTypeDistributionProps {
  data: Array<{ type: string; count: number; storage: number }>;
}

const COLORS = [
  'var(--mantine-color-blue-6)',
  'var(--mantine-color-violet-6)',
  'var(--mantine-color-teal-6)',
  'var(--mantine-color-orange-6)',
  'var(--mantine-color-pink-6)',
  'var(--mantine-color-indigo-6)',
  'var(--mantine-color-cyan-6)',
  'var(--mantine-color-green-6)',
  'var(--mantine-color-red-6)',
  'var(--mantine-color-yellow-6)',
];

export function FileTypeDistribution({ data }: FileTypeDistributionProps) {
  const { t } = useTranslation('serverActions');

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalFiles = data.reduce((sum, d) => sum + d.count, 0);
  const totalStorage = data.reduce((sum, d) => sum + d.storage, 0);

  if (!data.length) {
    return (
      <Paper withBorder p='md'>
        <Title order={4}>{t('admin.analytics.fileTypes')}</Title>
        <Text size='sm' c='dimmed' mt='md' ta='center'>
          {t('admin.analytics.noData')}
        </Text>
      </Paper>
    );
  }

  const chartData = useMemo(
    () =>
      data.map((d, index) => ({
        type: d.type,
        count: d.count,
        storage: d.storage,
        color: COLORS[index % COLORS.length],
      })),
    [data],
  );

  return (
    <Paper withBorder p='md' style={{ height: 350 }}>
      <Group justify='space-between' mb='md'>
        <Title order={4}>{t('admin.analytics.fileTypes')}</Title>
        <Group gap='xs'>
          <Text size='sm' c='dimmed'>
            {totalFiles} {t('admin.analytics.files')}
          </Text>
          <Text size='sm' c='dimmed'>
            {formatBytes(totalStorage)}
          </Text>
        </Group>
      </Group>
      <PieChart
        data={chartData.map((d) => ({ name: d.type, value: d.count, color: d.color }))}
        tooltipProps={{
          content: ({ payload }) => (
            <ChartTooltip
              label={payload[0]?.name || ''}
              payload={payload}
              valueFormatter={(v) => v.toString()}
              series={[{ name: 'count', label: t('admin.analytics.files') }]}
            />
          ),
        }}
        withLegend
        legendProps={{
          layout: 'vertical',
          align: 'right',
          verticalAlign: 'middle',
          formatter: (value) => {
            const item = data.find((d) => d.type === value);
            if (!item) return value;
            return `${value} (${item.count} files, ${formatBytes(item.storage)})`;
          },
        }}
      />
      <Box mt='md'>
        <Text size='xs' c='dimmed'>
          {t('admin.analytics.byCount')}
        </Text>
        <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {data.map((item, index) => (
            <Box key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span
                style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  borderRadius: '50%',
                  backgroundColor: COLORS[index % COLORS.length],
                  display: 'inline-block',
                }}
              />
              <Text size='xs'>
                {item.type}: {item.count} ({((item.count / totalFiles) * 100).toFixed(1)}%)
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}
