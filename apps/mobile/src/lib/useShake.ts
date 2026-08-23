import { useEffect } from 'react';
import { Platform } from 'react-native';

// Calls onShake once when the device is shaken. Subscribes only while `active`, so the sensor is off almost always.
export function useShake(active: boolean, onShake: () => void) {
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    let Accelerometer: typeof import('expo-sensors').Accelerometer;
    try { ({ Accelerometer } = require('expo-sensors') as typeof import('expo-sensors')); } catch { return; } // binary built without the sensor module
    let fired = false;
    let last = 0;
    Accelerometer.setUpdateInterval(80);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const g = Math.sqrt(x * x + y * y + z * z); // ~1 at rest (units of g)
      const now = Date.now();
      if (g > 2.4 && now - last > 250) { // ponytail: single-threshold shake; a two-peak detector if false triggers appear
        last = now;
        if (!fired) { fired = true; onShake(); }
      }
    });
    return () => sub.remove();
  }, [active, onShake]);
}
