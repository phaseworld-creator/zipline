import dayjs from 'dayjs';
import { LineChart, ChartTooltip } from '@mantine/charts';
import { Paper, Title, SimpleGrid, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface UploadPatternsProps {
  data: {
    byHour: number[];
    byDay: Array<{ day: string; uploads: number }>;
  };
}

export function UploadPatterns({ data }: UploadPatternsProps) {
  const { t } = useTranslation('serverActions');

  const hourData = useMemo(
    () =>
      data.byHour.map((uploads, hour) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        uploads,
      })),
    [data.byHour],
  );

  const dayData = useMemo(
    () =>
      data.byDay.map((d) => ({
        day: dayjs(d.day).format('MMM DD'),
        uploads: d.uploads,
      })),
    [data.byDay],
  );

  if (!hourData.some((d) => d.uploads > 0) && !dayData.some((d) => d.uploads > 0)) {
    return (
      <Paper withBorder p='md'>
        <Title order={4}>{t('admin.analytics.uploadPatterns')}</Title>
        <Text size='sm' c='dimmed' mt='md' ta='center'>
          {t('admin.analytics.noData')}
        </Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder p='md'>
      <Title order={4} mb='md'>
        {t('admin.analytics.uploadPatterns')}
      </Title>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing='md'>
        <div style={{ height: 250 }}>
          <LineChart
            data={hourData}
            dataKey='hour'
            series={[{ name: 'uploads', label: t('admin.analytics.uploads') }]}
            valueFormatter={(v) => v.toString()}
            xAxisProps={{ type: 'number', tickFormatter: (v) => v.toString() }}
            yAxisProps={{ type: 'category', dataKey: 'hour', width: 50 }}
            tooltipProps={{
              content: ({ label, payload }) => (
                <ChartTooltip
                  label={label}
                  payload={payload}
                  valueFormatter={(v) => v.toString()}
                  series={[{ name: 'uploads', label: t('admin.analytics.uploads') }]}
                />
              ),
            }}
            withLegend={false}
            curveType='step'
            dotProps={{ r: 0 }}
          />
          <Text size='xs' c='dimmed' mt='xs' ta='center'>
            {t('admin.analytics.byHour')}
          </Text>
        </div>
        <div style={{ height: 250 }}>
          <LineChart
            data={dayData}
            dataKey='day'
            series={[{ name: 'uploads', label: t('admin.analytics.uploads') }]}
            valueFormatter={(v) => v.toString()}
            xAxisProps={{ dataKey: 'day', tickFormatter: (v) => v }}
            tooltipProps={{
              content: ({ label, payload }) => (
                <ChartTooltip
                  label={label}
                  payload={payload}
                  valueFormatter={(v) => v.toString()}
                  series={[{ name: 'uploads', label: t('admin.analytics.uploads') }]}
                />
              ),
            }}
            withLegend={false}
            curveType='monotone'
            dotProps={{ r: 4, strokeWidth: 2 }}
            activeDotProps={{ r: 6 }}
          />
          <Text size='xs' c='dimmed' mt='xs' ta='center'>
            {t('admin.analytics.byDay')}
          </Text>
        </div>
      </SimpleGrid>
    </Paper>
  );
}
