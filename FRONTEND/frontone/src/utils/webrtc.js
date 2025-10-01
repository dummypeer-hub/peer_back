// WebRTC utility functions for better cross-network connectivity

export const getOptimizedICEServers = () => {
  return [
    // Primary Cloudflare TURN servers (your credentials) - FIRST PRIORITY
    {
      urls: [
        'turn:turn.cloudflare.com:3478',
        'turns:turn.cloudflare.com:5349'
      ],
      username: 'ccb11479d57e58d6450a4743bad9a1e8',
      credential: '75063d2f78527ff8115025d127e87619d62c4428ed6ff1b001fc3cf03d0ba514'
    },
    // STUN servers for connectivity detection
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    
    // Backup TURN servers (fallback only)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: ['turn:relay1.expressturn.com:3478'],
      username: 'ef3CYGPRL8ZPAA5KXC',
      credential: 'Hj8pBqZnfQmxrLzM'
    }
  ];
};

export const createPeerConnection = (onIceCandidate, onTrack, onConnectionStateChange) => {
  const config = {
    iceServers: getOptimizedICEServers(),
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  };

  const pc = new RTCPeerConnection(config);

  // Enhanced connection monitoring
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('ICE candidate:', event.candidate.type, event.candidate.protocol);
      onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = onTrack;

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    onConnectionStateChange(pc.connectionState);
    
    if (pc.connectionState === 'failed') {
      console.log('Connection failed, attempting ICE restart');
      setTimeout(() => {
        if (pc.connectionState === 'failed') {
          pc.restartIce();
        }
      }, 2000);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      console.log('ICE connection failed, restarting');
      pc.restartIce();
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', pc.iceGatheringState);
  };

  return pc;
};

export const testConnectivity = async (iceServers) => {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers });
    const results = [];
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        results.push({
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address
        });
      } else {
        // ICE gathering complete
        pc.close();
        resolve(results);
      }
    };
    
    // Create a dummy data channel to trigger ICE gathering
    pc.createDataChannel('test');
    pc.createOffer().then(offer => pc.setLocalDescription(offer));
    
    // Timeout after 10 seconds
    setTimeout(() => {
      pc.close();
      resolve(results);
    }, 10000);
  });
};