import { useQuery } from '@tanstack/react-query';

interface HealthResponse {
  status: 'ok' | 'error';
  db: 'up' | 'down';
  redis: 'up' | 'down';
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('api/health');
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return res.json() as Promise<HealthResponse>;
}

export const HealthStatus = () => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  if (isPending) return <p>Checking backend</p>;
  if (isError) return <p>Backend unhealthy: {error.message}</p>;

  return (
    <ul>
      <li>status: {data.status}</li>
      <li>db: {data.db}</li>
      <li>redis: {data.redis}</li>
    </ul>
  );
};
