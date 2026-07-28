import { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n.jsx';

export default function SecondsAgo({ fetchedAt, className }) {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(
    () => fetchedAt ? Math.floor((Date.now() - fetchedAt) / 1000) : 0
  );

  useEffect(() => {
    if (!fetchedAt) return;
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - fetchedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  return (
    <p className={className}>
      {t.secondsAgo(seconds)}
    </p>
  );
}
