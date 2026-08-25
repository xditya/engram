import { router } from 'expo-router';
import { store } from 'expo-router/build/global-state/router-store';

// Return to the library by unwinding the stack, never by pushing or replacing on top of it: a replace('/') from
// three screens deep leaves the old screens underneath, and the next back press lands on them. dismissTo('/')
// is not enough either — a deep link pushes a second '/' on top, and that one would match.
export function goHome() {
  if (router.canGoBack()) router.dismissAll();
  if (store.getRouteInfo().pathname !== '/') router.replace('/');
}
