import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** One step back; without history (the screen was opened directly) it goes to "Сегодня". */
export function useGoBack() {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(
    () => (key === 'default' ? navigate('/', { replace: true }) : navigate(-1)),
    [key, navigate],
  );
}
