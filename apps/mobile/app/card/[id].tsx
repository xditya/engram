import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PagerView from 'react-native-pager-view';
import { CardDetail } from '../../src/features/detail/CardDetail';
import { detailSet } from '../../src/features/detail/resultSet';

// /card/:id?ids=a,b,c — swipe left/right through the result set; the modal's own gesture handles swipe down.
export default function CardRoute() {
  const { id, ids } = useLocalSearchParams<{ id: string; ids?: string }>();
  const router = useRouter();
  const [set] = useState(() => {
    const list = ids ? ids.split(',') : detailSet.get();
    return list.includes(id) ? list : [id];
  });
  const [current, setCurrent] = useState(id);
  const dismiss = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <PagerView style={{ flex: 1 }} initialPage={set.indexOf(id)} onPageSelected={(e) => setCurrent(set[e.nativeEvent.position] ?? id)}>
      {set.map((cardId) => (
        <CardDetail key={cardId} id={cardId} active={cardId === current} onDismiss={dismiss} />
      ))}
    </PagerView>
  );
}
