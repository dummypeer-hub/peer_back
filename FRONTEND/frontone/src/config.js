const config = {
  API_BASE_URL: process.env.NODE_ENV === 'production' 
    ? (window.location.hostname === 'www.peerverse.in' || window.location.hostname === 'peerverse.in'
        ? 'https://peerverse-final.vercel.app/api'
        : 'https://peerverse-final.vercel.app/api')
    : 'http://localhost:5000/api',
  SOCKET_URL: process.env.NODE_ENV === 'production'
    ? (window.location.hostname === 'www.peerverse.in' || window.location.hostname === 'peerverse.in'
        ? 'https://peerverse-final.vercel.app'
        : 'https://peerverse-final.vercel.app')
    : 'http://localhost:5000'
};

export default config;
