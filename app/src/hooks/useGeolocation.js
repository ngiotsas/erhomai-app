import { useState, useEffect, useCallback, useRef } from 'react';

export const GEOLOCATION_STATES = {
  PENDING: 'pending',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  READY: 'ready',
};

export function useGeolocation() {
  const [state, setState] = useState(GEOLOCATION_STATES.PENDING);
  const [coords, setCoords] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

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
        if (!mountedRef.current) return;
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setState(GEOLOCATION_STATES.READY);
      },
      (error) => {
        if (!mountedRef.current) return;
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
