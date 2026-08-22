import type { SvgProps } from 'react-native-svg';
import Density from './svg/density.svg';
import DeviceBrowser from './svg/device-browser.svg';
import DeviceDesktop from './svg/device-desktop.svg';
import DevicePhone from './svg/device-phone.svg';
import DeviceTablet from './svg/device-tablet.svg';
import Key from './svg/key.svg';
import LetGo from './svg/let-go.svg';
import Pin from './svg/pin.svg';
import Qr from './svg/qr.svg';
import Resurface from './svg/resurface.svg';
import Spaces from './svg/spaces.svg';
import Strengthen from './svg/strengthen.svg';
import SyncFull from './svg/sync-full.svg';
import SyncSyncing from './svg/sync-syncing.svg';
import SyncUnreachable from './svg/sync-unreachable.svg';
import SyncUpToDate from './svg/sync-up-to-date.svg';
import TraceSvg from './svg/trace.svg';
import TypeArticle from './svg/type-article.svg';
import TypeImage from './svg/type-image.svg';
import TypeLink from './svg/type-link.svg';
import TypeNote from './svg/type-note.svg';
import TypePdf from './svg/type-pdf.svg';
import TypeProduct from './svg/type-product.svg';
import TypeQuote from './svg/type-quote.svg';
import TypeVideo from './svg/type-video.svg';
import ViewGrid from './svg/view-grid.svg';
import ViewList from './svg/view-list.svg';
import { useTheme } from '../theme/useTheme';

const icons = {
  density: Density,
  'device-browser': DeviceBrowser,
  'device-desktop': DeviceDesktop,
  'device-phone': DevicePhone,
  'device-tablet': DeviceTablet,
  key: Key,
  'let-go': LetGo,
  pin: Pin,
  qr: Qr,
  resurface: Resurface,
  spaces: Spaces,
  strengthen: Strengthen,
  'sync-full': SyncFull,
  'sync-syncing': SyncSyncing,
  'sync-unreachable': SyncUnreachable,
  'sync-up-to-date': SyncUpToDate,
  'type-article': TypeArticle,
  'type-image': TypeImage,
  'type-link': TypeLink,
  'type-note': TypeNote,
  'type-pdf': TypePdf,
  'type-product': TypeProduct,
  'type-quote': TypeQuote,
  'type-video': TypeVideo,
  'view-grid': ViewGrid,
  'view-list': ViewList,
} satisfies Record<string, React.FC<SvgProps>>;

export type IconName = keyof typeof icons;

// Glyphs are stroke="currentColor"; `color` tints them. Defaults to text2, the chrome icon colour.
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  const Glyph = icons[name];
  return <Glyph width={size} height={size} color={color ?? c.text2} />;
}

// The brand glyph. Always decorative: strength is exposed as text elsewhere.
export function Trace({ size = 12, opacity = 1, color }: { size?: number; opacity?: number; color?: string }) {
  const { c } = useTheme();
  return (
    <TraceSvg
      width={size}
      height={size}
      color={color ?? c.text}
      opacity={opacity}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
