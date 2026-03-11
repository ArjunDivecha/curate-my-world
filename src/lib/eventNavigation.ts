export const navigateToEventUrl = (url?: string) => {
  if (!url) return;
  window.location.assign(url);
};
