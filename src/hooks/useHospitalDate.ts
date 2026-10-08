import { useEffect, useState } from 'react';
import { getHospitalDate } from '../utils/hospitalDate';

export const useHospitalDate = (): string => {
  const [hospitalDate, setHospitalDate] = useState(getHospitalDate);

  useEffect(() => {
    const refreshDate = () => {
      const nextDate = getHospitalDate();
      setHospitalDate((currentDate) => currentDate === nextDate ? currentDate : nextDate);
    };
    const intervalId = window.setInterval(refreshDate, 30_000);
    document.addEventListener('visibilitychange', refreshDate);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshDate);
    };
  }, []);

  return hospitalDate;
};
