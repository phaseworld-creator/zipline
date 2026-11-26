import { Table, Paper, Title, Text, Badge } from '@mantine/core';
import { IconFile, IconDatabase, IconEye, IconLink, IconClock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface UserActivityTableProps {
  data: Array<{
    username: string | null;
    filesUploaded: number;
    storageUsed: number;
    fileViews: number;
    urlsCreated: number;
    urlViews: number;
    lastActive: string | null;
  }>;
}

export function UserActivityTable({ data }: UserActivityTableProps) {
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

  if (!data.length) {
    return (
      <Paper withBorder p='md'>
        <Title order={4}>{t('admin.analytics.userActivity')}</Title>
        <Text size='sm' c='dimmed' mt='md' ta='center'>
          {t('admin.analytics.noData')}
        </Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder p='md'>
      <Title order={4} mb='md'>
        {t('admin.analytics.userActivity')}
      </Title>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('admin.analytics.columns.user')}</Table.Th>
            <Table.Th>
              <IconFile size='1rem' />
              <span className='mantine-hidden'>{t('admin.analytics.columns.files')}</span>
            </Table.Th>
            <Table.Th>
              <IconDatabase size='1rem' />
              <span className='mantine-hidden'>{t('admin.analytics.columns.storage')}</span>
            </Table.Th>
            <Table.Th>
              <IconEye size='1rem' />
              <span className='mantine-hidden'>{t('admin.analytics.columns.views')}</span>
            </Table.Th>
            <Table.Th>
              <IconLink size='1rem' />
              <span className='mantine-hidden'>{t('admin.analytics.columns.urls')}</span>
            </Table.Th>
            <Table.Th>
              <IconEye size='1rem' />
              <span className='mantine-hidden'>{t('admin.analytics.columns.urlViews')}</span>
            </Table.Th>
            <Table.Th>
              <IconClock size='1rem' />
              <span className='mantine-hidden'>{t('admin.analytics.columns.lastActive')}</span>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((user, index) => (
            <Table.Tr key={index}>
              <Table.Td>
                <Text fw={500}>{user.username || t('admin.analytics.unknownUser')}</Text>
              </Table.Td>
              <Table.Td>{formatNumber(user.filesUploaded)}</Table.Td>
              <Table.Td>{formatBytes(user.storageUsed)}</Table.Td>
              <Table.Td>{formatNumber(user.fileViews)}</Table.Td>
              <Table.Td>{formatNumber(user.urlsCreated)}</Table.Td>
              <Table.Td>{formatNumber(user.urlViews)}</Table.Td>
              <Table.Td>
                {user.lastActive ? (
                  <Text size='sm' c='dimmed'>
                    {new Date(user.lastActive).toLocaleString()}
                  </Text>
                ) : (
                  <Badge variant='dot' color='gray'>
                    {t('admin.analytics.never')}
                  </Badge>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
