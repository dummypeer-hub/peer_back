// WebRTC utility functions with dynamic TURN credentials

export const getICEServers = async () => {
  try {
    const response = await fetch('/api/turn-credentials');
    const config = await response.json();
    return config.iceServers;
  } catch (error) {
    console.error('Failed to get TURN credentials, using fallback:', error);
    return [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' }
    ];
  }
};

export const createPeerConnection = async (onIceCandidate, onTrack, onConnectionStateChange) => {
  const iceServers = await getICEServers();
  
  const config = {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  };

  const pc = new RTCPeerConnection(config);

  // Enhanced connection monitoring
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('ICE candidate type:', event.candidate.type);
      if (event.candidate.type === 'relay') {
        console.log('✅ TURN relay candidate found');
      }
      onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = onTrack;

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    onConnectionStateChange(pc.connectionState);
    
    if (pc.connectionState === 'failed') {
      console.log('Connection failed, attempting ICE restart');
      pc.restartIce();
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

// Test TURN server with relay-only mode
export const createRelayOnlyPeerConnection = async () => {
  const iceServers = await getICEServers();
  
  const config = {
    iceServers,
    iceTransportPolicy: 'relay' // Forces TURN usage only
  };

  return new RTCPeerConnection(config);
};

export const testConnectivity = async () => {
  const iceServers = await getICEServers();
  
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers });
    const results = [];
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        results.push({
          type: event.candidate.type,
          protocol: event.candidate.protocol
        });
      } else {
        pc.close();
        resolve(results);
      }
    };
    
    pc.createDataChannel('test');
    pc.createOffer().then(offer => pc.setLocalDescription(offer));
    
    setTimeout(() => {
      pc.close();
      resolve(results);
    }, 10000);
  });
};