import { Grid, Paper, Text, Title } from '@mantine/core';
import {
  IconDatabase,
  IconFile,
  IconUsers,
  IconEye,
  IconLink,
  IconArrowsLeftRight,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface OverviewProps {
  overview: {
    totalUsers: number;
    totalFiles: number;
    totalUrls: number;
    totalStorage: number;
    totalFileViews: number;
    totalUrlViews: number;
  };
}

export function AnalyticsOverview({ overview }: OverviewProps) {
  const { t } = useTranslation('serverActions');

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const cards = [
    {
      label: t('admin.analytics.overview.users'),
      value: formatNumber(overview.totalUsers),
      icon: IconUsers,
      color: 'blue',
    },
    {
      label: t('admin.analytics.overview.files'),
      value: formatNumber(overview.totalFiles),
      icon: IconFile,
      color: 'violet',
    },
    {
      label: t('admin.analytics.overview.urls'),
      value: formatNumber(overview.totalUrls),
      icon: IconLink,
      color: 'teal',
    },
    {
      label: t('admin.analytics.overview.storage'),
      value: formatBytes(overview.totalStorage),
      icon: IconDatabase,
      color: 'orange',
    },
    {
      label: t('admin.analytics.overview.fileViews'),
      value: formatNumber(overview.totalFileViews),
      icon: IconEye,
      color: 'indigo',
    },
    {
      label: t('admin.analytics.overview.urlViews'),
      value: formatNumber(overview.totalUrlViews),
      icon: IconArrowsLeftRight,
      color: 'pink',
    },
  ];

  return (
    <Grid style={{ rowGap: 'md', columnGap: 'md' }}>
      {cards.map((card, index) => (
        <Grid.Col key={index} span={{ base: 6, sm: 4, md: 3, lg: 2 }}>
          <Paper
            withBorder
            p='md'
            style={{ textAlign: 'center', transition: 'transform 0.2s', cursor: 'default' }}
          >
            <card.icon
              size='1.5rem'
              style={{ color: `var(--mantine-color-${card.color}-6)`, marginBottom: '0.5rem' }}
            />
            <Title order={3} style={{ margin: 0, fontSize: '1.5rem' }}>
              {card.value}
            </Title>
            <Text size='sm' c='dimmed' mt='xs'>
              {card.label}
            </Text>
          </Paper>
        </Grid.Col>
      ))}
    </Grid>
  );
}
