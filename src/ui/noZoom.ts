/**
 * The app is a fixed-size screen, not a web page: pinching must not zoom it (Safari ignores
 * the viewport flags for accessibility, so the gestures are cancelled here as well).
 */
export function startNoZoom(): void {
  const stop = (e: Event) => e.preventDefault();
  // Safari-only pinch events.
  document.addEventListener('gesturestart', stop);
  document.addEventListener('gesturechange', stop);
  document.addEventListener('gestureend', stop);
  // Other browsers: a two-finger move is a pinch.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
