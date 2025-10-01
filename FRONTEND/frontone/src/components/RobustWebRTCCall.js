import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import config from '../config';

const RobustWebRTCCall = ({ callId, user, userRole, onCallEnd }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  // Enhanced ICE servers with your Cloudflare credentials prioritized
  const iceServers = [
    // STUN servers first
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Your Cloudflare TURN servers (primary)
    {
      urls: 'turn:turn.cloudflare.com:3478?transport=udp',
      username: 'ccb11479d57e58d6450a4743bad9a1e8',
      credential: '75063d2f78527ff8115025d127e87619d62c4428ed6ff1b001fc3cf03d0ba514'
    },
    {
      urls: 'turn:turn.cloudflare.com:3478?transport=tcp',
      username: 'ccb11479d57e58d6450a4743bad9a1e8',
      credential: '75063d2f78527ff8115025d127e87619d62c4428ed6ff1b001fc3cf03d0ba514'
    },
    {
      urls: 'turns:turn.cloudflare.com:5349',
      username: 'ccb11479d57e58d6450a4743bad9a1e8',
      credential: '75063d2f78527ff8115025d127e87619d62c4428ed6ff1b001fc3cf03d0ba514'
    },
    // Backup TURN servers
    {
      urls: 'turn:openrelay.metered.ca:80?transport=udp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:80?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  const pcConfig = {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  };

  useEffect(() => {
    initializeCall();
    return () => cleanup();
  }, []);

  const initializeCall = async () => {
    try {
      // Initialize socket
      socketRef.current = io(config.API_BASE_URL, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true
      });

      socketRef.current.on('connect', () => {
        console.log('🔌 Socket connected');
        socketRef.current.emit('join_call', callId);
        socketRef.current.emit('join_user_room', user.id);
      });

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          aspectRatio: { ideal: 16/9 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const pc = new RTCPeerConnection(pcConfig);
      peerConnectionRef.current = pc;

      // Add local stream
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('📺 Remote stream received');
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      };

      // Connection state monitoring
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log('🔗 Connection state:', state);
        setConnectionState(state);
        setIsConnected(state === 'connected');
        
        if (state === 'failed') {
          console.log('❌ Connection failed, attempting restart');
          setTimeout(() => {
            if (pc.connectionState === 'failed') {
              pc.restartIce();
            }
          }, 2000);
        }
      };

      // ICE connection state
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log('🧊 ICE connection state:', state);
        setIceConnectionState(state);
        
        if (state === 'failed' || state === 'disconnected') {
          console.log('🔄 ICE connection issues, restarting');
          pc.restartIce();
        }
      };

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate:', event.candidate.type);
          socketRef.current?.emit('ice_candidate', {
            callId,
            candidate: event.candidate,
            from: user.id,
            role: userRole
          });
        }
      };

      // Socket event handlers
      setupSocketHandlers(pc);

      // Start signaling based on role
      if (userRole === 'mentor') {
        setTimeout(() => createOffer(pc), 1000);
      }

    } catch (error) {
      console.error('❌ Failed to initialize call:', error);
    }
  };

  const setupSocketHandlers = (pc) => {
    // Handle offers
    socketRef.current.on('offer', async (data) => {
      if (data.from !== user.id && data.callId == callId) {
        console.log('📨 Received offer from', data.from);
        try {
          await pc.setRemoteDescription(data.offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          socketRef.current.emit('answer', {
            callId,
            answer,
            from: user.id,
            role: userRole
          });
          console.log('✅ Answer sent');
        } catch (error) {
          console.error('❌ Error handling offer:', error);
        }
      }
    });

    // Handle answers
    socketRef.current.on('answer', async (data) => {
      if (data.from !== user.id && data.callId == callId) {
        console.log('📨 Received answer from', data.from);
        try {
          await pc.setRemoteDescription(data.answer);
          console.log('✅ Answer processed');
        } catch (error) {
          console.error('❌ Error handling answer:', error);
        }
      }
    });

    // Handle ICE candidates
    socketRef.current.on('ice_candidate', async (data) => {
      if (data.from !== user.id && data.callId == callId) {
        console.log('🧊 Received ICE candidate from', data.from);
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (error) {
          console.error('❌ Error adding ICE candidate:', error);
        }
      }
    });

    // Global fallback handlers
    socketRef.current.on('global_offer', async (data) => {
      if (data.from !== user.id && data.callId == callId) {
        console.log('📡 Processing global offer backup');
        socketRef.current.emit('offer', data);
      }
    });
  };

  const createOffer = async (pc) => {
    try {
      console.log('📤 Creating offer...');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(offer);
      
      socketRef.current.emit('offer', {
        callId,
        offer,
        from: user.id,
        role: userRole
      });
      
      console.log('✅ Offer sent');
    } catch (error) {
      console.error('❌ Error creating offer:', error);
    }
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('🚫 Stopped track:', track.kind);
      });
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const endCall = () => {
    cleanup();
    onCallEnd?.();
  };

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      background: '#1a1a1a', 
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Connection Status */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '20px',
        fontSize: '12px',
        zIndex: 1000
      }}>
        {connectionState === 'connected' ? '🟢 Connected' : 
         connectionState === 'connecting' ? '🟡 Connecting...' :
         connectionState === 'failed' ? '🔴 Failed' : '⚪ Initializing'}
      </div>

      {/* Remote Video */}
      <div style={{ flex: 1, position: 'relative', background: '#2a2a2a' }}>
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center'
          }}
        />
        {!remoteStream && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            textAlign: 'center'
          }}>
            <div>Waiting for other participant...</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              ICE: {iceConnectionState} | Connection: {connectionState}
            </div>
          </div>
        )}
      </div>

      {/* Local Video */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        width: '240px',
        height: '180px',
        border: '3px solid #1a73e8',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#3c4043'
      }}>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center'
          }}
        />
      </div>

      {/* Controls */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '12px'
      }}>
        <button
          onClick={endCall}
          style={{
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '56px',
            height: '56px',
            cursor: 'pointer',
            fontSize: '20px'
          }}
        >
          📞
        </button>
      </div>
    </div>
  );
};

export default RobustWebRTCCall;