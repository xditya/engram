import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { VideoView, useVideoPlayer } from 'expo-video';
import { extract } from '@engram/core';
import { useTheme } from '../../theme/useTheme';

const ORIGIN = 'https://engram.xditya.me';
const frame = (src: string) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style><iframe src="${src.replace(/"/g, '&quot;')}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;

// A poster with a play button; tapping it swaps in the site's embed player (YouTube, Instagram, TikTok,
// Vimeo, X) or the native player for a media file. The card stays what it was: nothing is downloaded.
export function Player({ url, poster, width, height }: { url: string; poster?: { uri: string }; width: number; height: number }) {
  const { c } = useTheme();
  const play = extract.playable(url);
  const [on, setOn] = useState(false);
  const h = play ? Math.min(Math.round(width / play.ratio), Math.round(height * 1.6)) : height;
  if (play && on) {
    return (
      <View style={{ width, height: h, backgroundColor: '#000' }}>
        {play.kind === 'file' ? <FilePlayer src={play.src} /> : (
          <WebView
            // The embed sits in an iframe on a page of ours: YouTube (error 153) and X refuse to play when no
            // referrer arrives, and baseUrl is what gives the page one.
            source={{ baseUrl: ORIGIN, html: frame(play.src) }}
            originWhitelist={['*']}
            style={{ flex: 1, backgroundColor: '#000' }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
            // Embeds are shown as the site ships them; links out of them go nowhere from inside the card.
            onShouldStartLoadWithRequest={(r) => r.url.startsWith(ORIGIN) || r.url === 'about:blank' || r.navigationType !== 'click'}
            startInLoadingState
            renderLoading={() => <ActivityIndicator color="#fff" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />}
          />
        )}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole={play ? 'button' : undefined} accessibilityLabel={play ? 'Play' : undefined} disabled={!play} onPress={() => setOn(true)} style={{ width, height, backgroundColor: c.surface2 }}>
      {poster ? <Image source={{ uri: poster.uri }} contentFit="cover" style={{ width, height }} /> : null}
      {play ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' }}>
            {/* a drawn triangle: glyphs sit off-centre in every font */}
            <View style={{ marginLeft: 6, width: 0, height: 0, borderTopWidth: 12, borderBottomWidth: 12, borderLeftWidth: 20, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff' }} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function FilePlayer({ src }: { src: string }) {
  const player = useVideoPlayer(src, (p) => { p.play(); });
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" allowsPictureInPicture nativeControls />;
}
