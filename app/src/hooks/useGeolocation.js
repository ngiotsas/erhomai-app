import { useState, useEffect, useCallback } from 'react';

export const GEOLOCATION_STATES = {
  PENDING: 'pending',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  READY: 'ready',
};

export function useGeolocation() {
  const [state, setState] = useState(GEOLOCATION_STATES.PENDING);
  const [coords, setCoords] = useState(null);

  const requestPosition = useCallback((resetCoords = false) => {
    if (!navigator.geolocation) {
      setState(GEOLOCATION_STATES.UNAVAILABLE);
      return;
    }

    if (resetCoords) {
      setState(GEOLOCATION_STATES.PENDING);
      setCoords(null);
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setState(GEOLOCATION_STATES.READY);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setState(GEOLOCATION_STATES.DENIED);
        } else {
          setState(GEOLOCATION_STATES.UNAVAILABLE);
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    requestPosition();
  }, [requestPosition]);

  const retry = useCallback(() => {
    requestPosition(true);
  }, [requestPosition]);

  return { coords, state, retry };
}
