import { Box, Button, Group, Modal, Paper, SimpleGrid, Text, Title, Tooltip } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCalendarSearch, IconCalendarTime } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApiAnalytics } from './useAnalytics';
import { AnalyticsOverview } from './parts/AnalyticsOverview';
import { StorageTrend } from './parts/StorageTrend';
import { UserActivityTable } from './parts/UserActivityTable';
import { FileTypeDistribution } from './parts/FileTypeDistribution';
import { UploadPatterns } from './parts/UploadPatterns';
import { TopUsers } from './parts/TopUsers';

export default function DashboardAdminAnalytics() {
  const { t } = useTranslation('serverActions');
  const today = dayjs();

  const [dateRange, setDateRange] = useState<[string | null, string | null]>([
    today.subtract(30, 'day').toISOString(),
    today.toISOString(),
  ]);

  const [open, setOpen] = useState(false);
  const [allTime, setAllTime] = useState(false);

  const { data, isLoading } = useApiAnalytics({
    days: allTime ? undefined : Math.ceil(dayjs(dateRange[1]).diff(dayjs(dateRange[0]), 'day')),
  });

  const [maxDate] = useState(() => new Date());

  const handleDateChange = (value: [string | null, string | null]) => {
    setAllTime(false);
    setDateRange(value);
  };

  const showAllTime = () => {
    setAllTime(true);
    setDateRange([null, null]);
  };

  return (
    <>
      <Modal
        title={t('admin.analytics.rangeModalTitle')}
        opened={open}
        onClose={() => setOpen(false)}
        size='auto'
      >
        <Paper withBorder style={{ minHeight: 300 }}>
          <DatePicker
            type='range'
            value={dateRange}
            onChange={handleDateChange}
            allowSingleDateInRange={false}
            maxDate={maxDate}
            presets={[
              {
                value: [today.subtract(6, 'day').format('YYYY-MM-DD'), today.format('YYYY-MM-DD')],
                label: t('admin.analytics.presets.last7Days'),
              },
              {
                value: [today.subtract(29, 'day').format('YYYY-MM-DD'), today.format('YYYY-MM-DD')],
                label: t('admin.analytics.presets.last30Days'),
              },
              {
                value: [today.startOf('month').format('YYYY-MM-DD'), today.format('YYYY-MM-DD')],
                label: t('admin.analytics.presets.thisMonth'),
              },
              {
                value: [
                  today.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
                  today.subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
                ],
                label: t('admin.analytics.presets.lastMonth'),
              },
              {
                value: [today.startOf('year').format('YYYY-MM-DD'), today.format('YYYY-MM-DD')],
                label: t('admin.analytics.presets.thisYear'),
              },
            ]}
          />
        </Paper>

        <Group mt='lg'>
          <Button fullWidth onClick={() => setOpen(false)}>
            {t('admin.analytics.close')}
          </Button>
        </Group>
      </Modal>

      <Group>
        <Title>{t('admin.analytics.title')}</Title>
        <Button
          size='compact-sm'
          variant='outline'
          leftSection={<IconCalendarSearch size='1rem' />}
          onClick={() => setOpen(true)}
        >
          {t('admin.analytics.changeRange')}
        </Button>
        {!allTime ? (
          <Text size='sm' c='dimmed'>
            {dateRange[1]
              ? t('admin.analytics.fromTo', {
                  from: dateRange[0] ? new Date(dateRange[0]).toLocaleDateString() : '—',
                  to: new Date(dateRange[1]).toLocaleDateString(),
                })
              : dateRange[0]
                ? new Date(dateRange[0]).toLocaleDateString()
                : '—'}
          </Text>
        ) : (
          <Text size='sm' c='dimmed'>
            {t('admin.analytics.allTime')}
          </Text>
        )}
        <Tooltip label={!allTime ? t('admin.analytics.allTimeWarning') : t('admin.analytics.viewingAllTime')}>
          <Button
            size='compact-sm'
            variant='outline'
            leftSection={<IconCalendarTime size='1rem' />}
            onClick={() => showAllTime()}
            disabled={allTime}
          >
            {t('admin.analytics.showAllTime')}
          </Button>
        </Tooltip>
      </Group>

      <Box pos='relative' mih={400} my='sm'>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Text size='sm' c='dimmed'>
              {t('admin.analytics.loading')}
            </Text>
          </div>
        ) : data ? (
          <div>
            <AnalyticsOverview overview={data.overview} />
            <SimpleGrid mt='md' cols={{ base: 1, lg: 2 }}>
              <StorageTrend data={data.storageTrend} />
              <FileTypeDistribution data={data.fileTypeDistribution} />
            </SimpleGrid>
            <SimpleGrid mt='md' cols={{ base: 1, lg: 2 }}>
              <UploadPatterns data={data.uploadPatterns} />
              <TopUsers data={data.topUsers} />
            </SimpleGrid>
            <Box mt='md'>
              <UserActivityTable data={data.userActivity} />
            </Box>
          </div>
        ) : (
          <Text size='sm' c='red'>
            {t('admin.analytics.loadFailed')}
          </Text>
        )}
      </Box>
    </>
  );
}
