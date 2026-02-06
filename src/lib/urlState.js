// URL State Encoding/Decoding for Shareable Offers

// Encode state to URL-safe string
export function encodeOffer(state) {
  const json = JSON.stringify(state);
  return btoa(encodeURIComponent(json));
}

// Decode URL string back to state
export function decodeOffer(encoded) {
  try {
    const json = decodeURIComponent(atob(encoded));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Update URL without page reload
export function updateURL(state) {
  const encoded = encodeOffer(state);
  const url = new URL(window.location.href);
  url.searchParams.set('offer', encoded);
  window.history.replaceState({}, '', url);
}

// Read offer from current URL
export function getOfferFromURL() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('offer');
  return encoded ? decodeOffer(encoded) : null;
}

// Generate shareable URL with current state
export function generateShareableURL(state) {
  const encoded = encodeOffer(state);
  const url = new URL(window.location.href);
  url.searchParams.set('offer', encoded);
  return url.toString();
}
