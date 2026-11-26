import DashboardAdminAnalytics from '@/components/pages/admin/Analytics';
import { useTitle } from '@/lib/client/hooks/useTitle';
import { useTranslation } from 'react-i18next';

export function Component() {
  const { t } = useTranslation('serverActions');
  useTitle(t('admin.analytics.title'));

  return <DashboardAdminAnalytics />;
}

Component.displayName = 'Dashboard/Admin/Analytics';
