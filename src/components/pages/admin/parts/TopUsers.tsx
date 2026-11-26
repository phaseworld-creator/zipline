import { Paper, Title, SimpleGrid, Group, Text, Badge, ScrollArea } from '@mantine/core';
import { IconDatabase, IconFile, IconEye, IconTrophy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface TopUsersProps {
  data: {
    byStorage: Array<{ username: string | null; storage: number; files: number }>;
    byFiles: Array<{ username: string | null; files: number; storage: number }>;
    byViews: Array<{ username: string | null; views: number; files: number }>;
  };
}

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

interface TopUserListItem {
  username: string | null;
  storage?: number;
  files?: number;
  views?: number;
}

const TopUserList = ({
  title,
  icon,
  data,
  valueKey,
  valueFormatter,
  secondaryKey,
  secondaryFormatter,
}: {
  title: string;
  icon: React.ReactNode;
  data: TopUserListItem[];
  valueKey: keyof TopUserListItem;
  valueFormatter: (v: number) => string;
  secondaryKey: keyof TopUserListItem;
  secondaryFormatter: (v: number) => string;
}) => {
  if (!data.length) return null;

  return (
    <Paper withBorder p='md' style={{ minHeight: 300 }}>
      <Group mb='md'>
        <IconTrophy size='1rem' color='var(--mantine-color-yellow-6)' />
        <Title order={5}>{title}</Title>
      </Group>
      <ScrollArea style={{ maxHeight: 280 }}>
        {data.map((user, index) => (
          <Group
            key={index}
            justify='space-between'
            align='center'
            py='xs'
            style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}
          >
            <Group gap='sm'>
              <Badge variant='filled' color='gray' size='sm'>
                #{index + 1}
              </Badge>
              <Text fw={500}>{user.username || 'Anonymous'}</Text>
            </Group>
            <Group gap='md'>
              <Group gap='xs'>
                {icon}
                <Text fw={500}>{valueFormatter(Number(user[valueKey]) || 0)}</Text>
              </Group>
              <Group gap='xs'>
                <IconFile size='1rem' color='dimmed' />
                <Text size='sm' c='dimmed'>
                  {secondaryFormatter(Number(user[secondaryKey]) || 0)}
                </Text>
              </Group>
            </Group>
          </Group>
        ))}
      </ScrollArea>
    </Paper>
  );
};

export function TopUsers({ data }: TopUsersProps) {
  const { t } = useTranslation('serverActions');

  if (!data.byStorage.length && !data.byFiles.length && !data.byViews.length) {
    return (
      <Paper withBorder p='md'>
        <Title order={4}>{t('admin.analytics.topUsers')}</Title>
        <Text size='sm' c='dimmed' mt='md' ta='center'>
          {t('admin.analytics.noData')}
        </Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder p='md'>
      <Title order={4} mb='md'>
        {t('admin.analytics.topUsers')}
      </Title>
      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing='md'>
        <TopUserList
          title={t('admin.analytics.byStorage')}
          icon={<IconDatabase size='1rem' color='var(--mantine-color-orange-6)' />}
          data={data.byStorage}
          valueKey='storage'
          valueFormatter={formatBytes}
          secondaryKey='files'
          secondaryFormatter={formatNumber}
        />
        <TopUserList
          title={t('admin.analytics.byFiles')}
          icon={<IconFile size='1rem' color='var(--mantine-color-violet-6)' />}
          data={data.byFiles}
          valueKey='files'
          valueFormatter={formatNumber}
          secondaryKey='storage'
          secondaryFormatter={formatBytes}
        />
        <TopUserList
          title={t('admin.analytics.byViews')}
          icon={<IconEye size='1rem' color='var(--mantine-color-blue-6)' />}
          data={data.byViews}
          valueKey='views'
          valueFormatter={formatNumber}
          secondaryKey='files'
          secondaryFormatter={formatNumber}
        />
      </SimpleGrid>
    </Paper>
  );
}
