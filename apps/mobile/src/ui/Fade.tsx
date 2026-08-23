import { View } from 'react-native';

// Fills its parent with `color`, transparent at the top and solid from `solidAt` (0-1) down: the canvas fading over
// content. Built from stacked plain Views (an eased opacity ramp) because SVG gradient stops are unreliable on Android.
const STEPS = 40;
export function Fade({ color, solidAt = 0.4 }: { color: string; solidAt?: number }) {
  const ramp = Array.from({ length: STEPS }, (_, i) => { const t = (i + 1) / STEPS; return t * t; }); // ease-in: soft start, solid end
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <View style={{ height: `${solidAt * 100}%`, flexDirection: 'column' }}>
        {ramp.map((o, i) => <View key={i} style={{ flex: 1, backgroundColor: color, opacity: o }} />)}
      </View>
      <View style={{ flex: 1, backgroundColor: color }} />
    </View>
  );
}
