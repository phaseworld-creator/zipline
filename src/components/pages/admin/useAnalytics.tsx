import { Response } from '@/lib/api/response';
import useSWR from 'swr';

type ApiAnalyticsOptions = {
  days?: number;
};

const fetcher = async ([url, options]: [string, ApiAnalyticsOptions]) => {
  const searchParams = new URLSearchParams();
  if (options.days) searchParams.append('days', options.days.toString());

  const res = await fetch(`${url}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`);

  if (!res.ok) {
    const json = await res.json();

    throw new Error(json.message);
  }

  return res.json();
};

export function useApiAnalytics(options: ApiAnalyticsOptions = {}) {
  const { data, error, isLoading, mutate } = useSWR<Response['/api/server/analytics']>(
    ['/api/server/analytics', options],
    { fetcher },
  );

  return {
    data,
    error,
    isLoading,
    mutate,
  };
}
