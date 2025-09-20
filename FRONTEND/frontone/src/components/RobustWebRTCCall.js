import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import config from '../config';
import './CloudflareVideoCall.css';

const RobustWebRTCCall = ({ callId, user, onEndCall }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(600);
  const [connectionState, setConnectionState] = useState('connecting');

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef();
  const socketRef = useRef();
  const dataChannelRef = useRef();
  const timerRef = useRef();

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:turn.cloudflare.com:3478',
      username: 'ccb11479d57e58d6450a4743bad9a1e8',
      credential: '75063d2f78527ff8115025d127e87619d62c4428ed6ff1b001fc3cf03d0ba514'
    }
  ];

  useEffect(() => {
    initializeCall();
    return cleanup;
  }, []);

  useEffect(() => {
    if (isConnected && !timerRef.current) {
      startTimer();
    }
  }, [isConnected]);

  const initializeCall = async () => {
    try {
      console.log(`🚀 Initializing call ${callId} for ${user.role}`);
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;

      // Add tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('📺 Remote stream received');
        const [stream] = event.streams;
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      };

      // Connection state monitoring
      pc.onconnectionstatechange = () => {
        console.log('🔗 Connection state:', pc.connectionState);
        setConnectionState(pc.connectionState);
        setIsConnected(pc.connectionState === 'connected');
      };

      pc.oniceconnectionstatechange = () => {
        console.log('🧊 ICE state:', pc.iceConnectionState);
      };

      // Setup Socket.IO
      await setupSocket(pc);

      // Setup data channel
      setupDataChannel(pc);

    } catch (error) {
      console.error('❌ Failed to initialize call:', error);
      alert('Failed to access camera/microphone. Please check permissions.');
    }
  };

  const setupSocket = async (pc) => {
    return new Promise((resolve, reject) => {
      const socket = io(config.SOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('✅ Socket connected');
        socket.emit('join_user_room', user.id);
        socket.emit('join_call', callId);
        setupSignaling(pc, socket);
        resolve();
      });

      socket.on('connect_error', (error) => {
        console.error('❌ Socket connection failed:', error);
        reject(error);
      });
    });
  };

  const setupSignaling = (pc, socket) => {
    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice_candidate', {
          callId,
          candidate: event.candidate,
          from: user.id
        });
      }
    };

    // Handle signaling events
    socket.on('offer', async (data) => {
      if (data.callId == callId && data.from !== user.id) {
        console.log('📨 Received offer');
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { callId, answer, from: user.id });
      }
    });

    socket.on('answer', async (data) => {
      if (data.callId == callId && data.from !== user.id) {
        console.log('📨 Received answer');
        await pc.setRemoteDescription(data.answer);
      }
    });

    socket.on('ice_candidate', async (data) => {
      if (data.callId == callId && data.from !== user.id) {
        await pc.addIceCandidate(data.candidate);
      }
    });

    // Chat messages
    socket.on('chat_message', (data) => {
      if (data.callId == callId && data.from !== user.id) {
        setMessages(prev => [...prev, data.message]);
      }
    });

    // Timer sync
    socket.on('timer_sync', (data) => {
      if (data.callId == callId) {
        setTimeLeft(data.timeLeft);
      }
    });

    // Start signaling if mentor
    if (user.role === 'mentor') {
      setTimeout(async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { callId, offer, from: user.id });
        console.log('📤 Sent offer');
      }, 1000);
    }
  };

  const setupDataChannel = (pc) => {
    if (user.role === 'mentor') {
      const channel = pc.createDataChannel('chat', { ordered: true });
      channel.onopen = () => console.log('💬 Data channel opened');
      channel.onmessage = (event) => {
        const message = JSON.parse(event.data);
        setMessages(prev => [...prev, message]);
      };
      dataChannelRef.current = channel;
    }

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.onopen = () => console.log('💬 Data channel received');
      channel.onmessage = (event) => {
        const message = JSON.parse(event.data);
        setMessages(prev => [...prev, message]);
      };
      dataChannelRef.current = channel;
    };
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 1;
        
        // Sync timer every 10 seconds
        if (newTime % 10 === 0 && socketRef.current) {
          socketRef.current.emit('timer_sync', {
            callId,
            timeLeft: newTime,
            from: user.id
          });
        }
        
        if (newTime <= 0) {
          handleEndCall();
          return 0;
        }
        return newTime;
      });
    }, 1000);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnectionRef.current.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
        
        videoTrack.onended = () => stopScreenShare();
        setIsScreenSharing(true);
      } else {
        stopScreenShare();
      }
    } catch (error) {
      console.error('Screen share error:', error);
    }
  };

  const stopScreenShare = async () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
      }
    }
    setIsScreenSharing(false);
  };

  const sendMessage = () => {
    if (newMessage.trim()) {
      const message = {
        text: newMessage,
        sender: user.username,
        timestamp: new Date().toLocaleTimeString(),
        from: user.id
      };

      // Send via data channel if available
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify(message));
      }

      // Also send via socket as backup
      if (socketRef.current) {
        socketRef.current.emit('chat_message', {
          callId,
          message,
          from: user.id
        });
      }

      setMessages(prev => [...prev, message]);
      setNewMessage('');
    }
  };

  const handleEndCall = async () => {
    try {
      await axios.post(`${config.API_BASE_URL}/video-call/${callId}/end`, {
        userId: user.id
      });
    } catch (error) {
      console.error('Failed to end call:', error);
    }
    cleanup();
    onEndCall();
  };

  const cleanup = () => {
    console.log('🧹 Cleaning up call resources');
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    if (socketRef.current) {
      socketRef.current.emit('leave_call', callId);
      socketRef.current.disconnect();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="cloudflare-video-call">
      <div className="video-container">
        <div className="remote-video">
          <video ref={remoteVideoRef} autoPlay playsInline />
          {!remoteStream && (
            <div className="waiting-message">
              <div>Waiting for other participant...</div>
              <div className="connection-status">
                Status: {connectionState}
              </div>
            </div>
          )}
        </div>
        
        <div className="local-video">
          <video ref={localVideoRef} autoPlay playsInline muted />
        </div>
      </div>

      <div className="call-controls">
        <div className="timer">
          <span className={timeLeft < 60 ? 'warning' : ''}>
            {formatTime(timeLeft)}
          </span>
        </div>

        <div className="control-buttons">
          <button 
            onClick={toggleMute}
            className={`control-btn ${isMuted ? 'muted' : ''}`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          
          <button 
            onClick={toggleVideo}
            className={`control-btn ${isVideoOff ? 'video-off' : ''}`}
            title={isVideoOff ? 'Turn on video' : 'Turn off video'}
          >
            {isVideoOff ? '📹' : '📷'}
          </button>
          
          <button 
            onClick={toggleScreenShare}
            className={`control-btn ${isScreenSharing ? 'sharing' : ''}`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            🖥️
          </button>
          
          <button 
            onClick={handleEndCall} 
            className="control-btn end-call"
            title="End call"
          >
            📞
          </button>
        </div>
      </div>

      <div className="chat-panel">
        <div className="chat-header">
          <h4>Chat</h4>
          <span className="connection-indicator">
            {isConnected ? '🟢 Connected' : '🔴 Connecting...'}
          </span>
        </div>
        
        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className="chat-message">
              <div className="message-header">
                <span className="sender">{msg.sender}</span>
                <span className="time">{msg.timestamp}</span>
              </div>
              <div className="message-text">{msg.text}</div>
            </div>
          ))}
        </div>
        
        <div className="chat-input">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            disabled={!isConnected}
          />
          <button 
            onClick={sendMessage}
            disabled={!newMessage.trim() || !isConnected}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default RobustWebRTCCall;