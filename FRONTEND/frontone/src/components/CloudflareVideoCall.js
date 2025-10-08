import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import config from '../config';
import { createPeerConnection, testConnectivity } from '../utils/webrtc';
import ConnectionIndicator from './ConnectionIndicator';
import './CloudflareVideoCall.css';

// Singleton Socket Manager for multiple concurrent calls
class SocketManager {
  constructor() {
    this.socket = null;
    this.callHandlers = new Map();
    this.isConnecting = false;
    this.connectionPromise = null;
  }

  async connect() {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }
    
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }
    
    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.socket = io(config.SOCKET_URL, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });
        
        this.socket.on('connect', () => {
          console.log('✅ Socket.IO connected successfully to:', config.SOCKET_URL);
          this.isConnecting = false;
          this.setupGlobalHandlers();
          resolve(this.socket);
        });
        
        this.socket.on('connect_error', (error) => {
          console.error('❌ Socket.IO connection error:', error);
          console.error('Trying to connect to:', config.SOCKET_URL);
          this.isConnecting = false;
          reject(error);
        });
        
        this.socket.on('disconnect', (reason) => {
          console.log('🔌 Socket.IO disconnected:', reason);
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
          console.log('🔄 Socket.IO reconnected after', attemptNumber, 'attempts');
        });
        
        this.socket.on('reconnect_error', (error) => {
          console.error('🔄❌ Socket.IO reconnection failed:', error);
        });
        
        console.log('🔌 Attempting to connect to Socket.IO:', config.SOCKET_URL);
        
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
    
    return this.connectionPromise;
  }

  setupGlobalHandlers() {
    this.socket.on('webrtc_offer', (data) => {
      const handler = this.callHandlers.get(data.callId);
      if (handler && handler.onOffer) {
        handler.onOffer(data);
      }
    });

    this.socket.on('webrtc_answer', (data) => {
      const handler = this.callHandlers.get(data.callId);
      if (handler && handler.onAnswer) {
        handler.onAnswer(data);
      }
    });

    this.socket.on('webrtc_ice_candidate', (data) => {
      const handler = this.callHandlers.get(data.callId);
      if (handler && handler.onIceCandidate) {
        handler.onIceCandidate(data);
      }
    });
  }

  registerCall(callId, handlers) {
    this.callHandlers.set(callId, handlers);
    this.socket.emit('join_call', callId);
  }

  unregisterCall(callId) {
    this.callHandlers.delete(callId);
    this.socket.emit('leave_call', callId);
  }

  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit:', event);
    }
  }
  
  isConnected() {
    return this.socket && this.socket.connected;
  }
}

const socketManager = new SocketManager();

const CloudflareVideoCall = ({ callId, user, onEndCall }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
  const [sessionStarted, setSessionStarted] = useState(false);
  
  // NEW: Chat panel states
  const [isChatMinimized, setIsChatMinimized] = useState(false);

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const dataChannelRef = useRef();
  const socketRef = useRef();
  const pcRef = useRef();
  
  // NEW: Chat panel refs
  const chatPanelRef = useRef(null);
  const isDraggingRef = useRef(false);

  const WEBRTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:relay1.expressturn.com:3480',
        username: '000000002074822364',
        credential: 'WnbuuoA398ZVw+A920nzNkU8eiw='
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  };

  useEffect(() => {
    initializeCall();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (sessionStarted && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleEndCall();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [sessionStarted, timeLeft]);

  // NEW: Drag functionality for chat panel
  useEffect(() => {
    const chatPanel = chatPanelRef.current;
    const chatHeader = chatPanel?.querySelector('.chat-header');
    
    if (!chatPanel || !chatHeader) return;

    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;

    const onMouseDown = (e) => {
      // Only allow dragging from header, not from control buttons
      if (e.target.closest('.chat-controls')) return;
      
      isDraggingRef.current = true;
      
      // Get current position
      const rect = chatPanel.getBoundingClientRect();
      initialX = e.clientX - rect.left;
      initialY = e.clientY - rect.top;
      
      chatHeader.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      
      e.preventDefault();
      
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      
      // Keep within viewport bounds
      const maxX = window.innerWidth - chatPanel.offsetWidth;
      const maxY = window.innerHeight - chatPanel.offsetHeight - 100; // 100px for controls
      
      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));
      
      chatPanel.style.left = currentX + 'px';
      chatPanel.style.top = currentY + 'px';
      chatPanel.style.right = 'auto';
      chatPanel.style.transform = 'none';
    };

    const onMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        chatHeader.style.cursor = 'grab';
      }
    };

    const onTouchStart = (e) => {
      if (e.target.closest('.chat-controls')) return;
      
      isDraggingRef.current = true;
      const touch = e.touches[0];
      
      const rect = chatPanel.getBoundingClientRect();
      initialX = touch.clientX - rect.left;
      initialY = touch.clientY - rect.top;
      
      e.preventDefault();
    };

    const onTouchMove = (e) => {
      if (!isDraggingRef.current) return;
      
      e.preventDefault();
      const touch = e.touches[0];
      
      currentX = touch.clientX - initialX;
      currentY = touch.clientY - initialY;
      
      const maxX = window.innerWidth - chatPanel.offsetWidth;
      const maxY = window.innerHeight - chatPanel.offsetHeight - 100;
      
      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));
      
      chatPanel.style.left = currentX + 'px';
      chatPanel.style.top = currentY + 'px';
      chatPanel.style.right = 'auto';
      chatPanel.style.transform = 'none';
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    // Add event listeners
    chatHeader.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    chatHeader.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    // Cleanup
    return () => {
      chatHeader.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      chatHeader.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const initializeCall = async () => {
    try {
      // Test connectivity first
      console.log('Testing connectivity...');
      const connectivityResults = await testConnectivity(WEBRTC_CONFIG.iceServers);
      console.log('Connectivity test results:', connectivityResults);
      
      // Get user media with mobile-optimized constraints
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      let stream = null;
      let hasVideo = false;
      let hasAudio = false;
      
      // Try to get video first
      try {
        const videoConstraints = isMobile ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          aspectRatio: { ideal: 4/3, min: 1, max: 2 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user'
        } : {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          aspectRatio: { ideal: 16/9 },
          frameRate: { ideal: 30 }
        };
        
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        hasVideo = true;
        hasAudio = true;
        console.log('✅ Full media access successful');
      } catch (error) {
        console.warn('Full media failed, trying video only:', error.message);
        
        // Try video only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          hasVideo = true;
          console.log('✅ Video-only access successful');
        } catch (videoError) {
          console.warn('Video failed, trying audio only:', videoError.message);
          
          // Try audio only
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            hasAudio = true;
            console.log('✅ Audio-only access successful');
          } catch (audioError) {
            console.warn('Audio failed, continuing without media:', audioError.message);
            
            // Create empty stream for meeting without media
            const confirmed = window.confirm(
              'Camera and microphone access failed. Do you want to join the meeting without video and audio? You can enable them later.'
            );
            
            if (!confirmed) {
              throw new Error('User cancelled meeting due to media access issues');
            }
            
            // Create a dummy stream
            stream = new MediaStream();
            console.log('⚠️ Joining meeting without media');
          }
        }
      }
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection using utility function
      const pc = createPeerConnection(
        (candidate) => {
          if (socketManager.isConnected()) {
            socketManager.emit('webrtc_ice_candidate', {
              callId,
              candidate,
              userId: user.id
            });
          }
        },
        (event) => {
          const [remoteStream] = event.streams;
          setRemoteStream(remoteStream);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
        },
        (connectionState) => {
          setIsConnected(connectionState === 'connected');
          if (connectionState === 'connected' && !sessionStarted) {
            setSessionStarted(true);
            startSession();
          }
        }
      );
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create data channel for chat (only for mentor)
      if (user.role === 'mentor') {
        const dataChannel = pc.createDataChannel('chat');
        dataChannel.onopen = () => {
          console.log('Data channel opened');
        };
        dataChannel.onmessage = (event) => {
          const message = JSON.parse(event.data);
          setMessages(prev => [...prev, message]);
        };
        dataChannelRef.current = dataChannel;
      }

      // Handle incoming data channel (for mentee)
      pc.ondatachannel = (event) => {
        console.log('Received data channel');
        const channel = event.channel;
        channel.onopen = () => {
          console.log('Incoming data channel opened');
        };
        channel.onmessage = (event) => {
          const message = JSON.parse(event.data);
          setMessages(prev => [...prev, message]);
        };
        dataChannelRef.current = channel;
      };

      setPeerConnection(pc);

      // Start signaling
      await handleSignaling(pc);

    } catch (error) {
      console.error('Failed to initialize call:', error);
      if (error.message.includes('User cancelled')) {
        onEndCall();
        return;
      }
      alert('Failed to initialize meeting: ' + error.message);
    }
  };

  const handleSignaling = async (pc) => {
    try {
      // Use singleton socket manager with proper await
      const socket = await socketManager.connect();
      socketRef.current = socket;
      pcRef.current = pc;
      
      console.log(`${user.role} joining call ${callId}`);
      
      // Join user room
      socket.emit('join_user_room', user.id);
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketManager.isConnected()) {
          console.log('Sending ICE candidate:', event.candidate);
          socketManager.emit('webrtc_ice_candidate', {
            callId,
            candidate: event.candidate,
            userId: user.id
          });
        }
      };
      
      // Register call-specific handlers
      socketManager.registerCall(callId, {
        onOffer: async (data) => {
          console.log('Received offer:', data);
          if (data.callId == callId && user.role === 'mentee') {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              
              console.log('Sending answer:', answer);
              if (socketManager.isConnected()) {
                socketManager.emit('webrtc_answer', {
                  callId,
                  answer,
                  userId: user.id
                });
              }
            } catch (error) {
              console.error('Error handling offer:', error);
            }
          }
        },
        
        onAnswer: async (data) => {
          console.log('Received answer:', data);
          if (data.callId == callId && user.role === 'mentor') {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (error) {
              console.error('Error handling answer:', error);
            }
          }
        },
        
        onIceCandidate: async (data) => {
          console.log('Received ICE candidate:', data);
          if (data.callId == callId && data.userId !== user.id) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
              console.error('Error adding ICE candidate:', error);
            }
          }
        }
      });
      
      // Create offer if mentor (after a small delay)
      if (user.role === 'mentor') {
        setTimeout(async () => {
          try {
            console.log('Creating offer...');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            console.log('Sending offer:', offer);
            if (socketManager.isConnected()) {
              socketManager.emit('webrtc_offer', {
                callId,
                offer,
                userId: user.id
              });
            }
          } catch (error) {
            console.error('Error creating offer:', error);
          }
        }, 1000);
      }
      
    } catch (error) {
      console.error('Signaling error:', error);
    }
  };

  const startSession = async () => {
    try {
      await axios.post(`${config.API_BASE_URL}/video-call/${callId}/start`, {
        userId: user.id
      });
    } catch (error) {
      console.error('Failed to start session:', error);
    }
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
        const sender = peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
        
        videoTrack.onended = () => {
          stopScreenShare();
        };
        
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
      const sender = peerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
      }
    }
    setIsScreenSharing(false);
  };

  const sendMessage = () => {
    if (newMessage.trim() && socketRef.current && socketRef.current.connected) {
      const message = {
        text: newMessage,
        sender: user.username,
        timestamp: new Date().toLocaleTimeString(),
        id: Date.now() + Math.random()
      };
      
      try {
        socketRef.current.emit('chat_message', {
          callId,
          message,
          from: user.id
        });
        setMessages(prev => [...prev, message]);
        setNewMessage('');
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    }
  };

  const handleEndCall = async () => {
    try {
      await axios.post(`${config.API_BASE_URL}/video-call/${callId}/end`, {
        userId: user.id
      });
      cleanup();
      onEndCall();
    } catch (error) {
      console.error('Failed to end call:', error);
      cleanup();
      onEndCall();
    }
  };

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    // Unregister this call from socket manager
    socketManager.unregisterCall(callId);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // NEW: Toggle chat minimize function
  const toggleChatMinimize = () => {
    setIsChatMinimized(!isChatMinimized);
  };

  return (
    <div className="cloudflare-video-call">
      <div className="video-container">
        <div className="remote-video">
          <video ref={remoteVideoRef} autoPlay playsInline />
          {!remoteStream && (
            <div className="waiting-message">
              <div className="waiting-icon">👥</div>
              <div className="waiting-text">Waiting for other participant...</div>
              <div className="connection-status">
                <div className={`status-indicator ${isConnected ? 'connected' : 'connecting'}`}></div>
                <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
              </div>
            </div>
          )}
          <ConnectionIndicator 
            peerConnection={peerConnection} 
            isConnected={isConnected} 
          />
        </div>
        
        <div className="local-video">
          <video ref={localVideoRef} autoPlay playsInline muted />
          {isVideoOff && (
            <div className="camera-off-overlay">
              <div className="camera-off-icon">📹</div>
              <span>Camera Off</span>
            </div>
          )}
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
            data-tooltip={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          
          <button 
            onClick={toggleVideo}
            className={`control-btn ${isVideoOff ? 'video-off' : ''}`}
            data-tooltip={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoOff ? '📹' : '📷'}
          </button>
          
          <button 
            onClick={toggleScreenShare}
            className={`control-btn ${isScreenSharing ? 'sharing' : ''}`}
            data-tooltip={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            🖥️
          </button>
          
          <button 
            onClick={handleEndCall} 
            className="control-btn end-call"
            data-tooltip="End call"
          >
            End Call
          </button>
        </div>
      </div>

      {/* UPDATED: Chat Panel with drag and minimize functionality */}
      <div 
        ref={chatPanelRef}
        className={`chat-panel ${isChatMinimized ? 'minimized' : ''}`}
      >
        <div className="chat-header">
          <h3>Chat</h3>
          <div className="chat-controls">
            <button 
              className="chat-control-btn" 
              onClick={toggleChatMinimize}
              title={isChatMinimized ? "Maximize" : "Minimize"}
            >
              {isChatMinimized ? '▢' : '−'}
            </button>
          </div>
        </div>
        
        {!isChatMinimized && (
          <>
            <div className="chat-messages">
              {messages.map((msg, index) => (
                <div key={msg.id || index} className="chat-message">
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
              />
              <button onClick={sendMessage} disabled={!newMessage.trim()}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CloudflareVideoCall;