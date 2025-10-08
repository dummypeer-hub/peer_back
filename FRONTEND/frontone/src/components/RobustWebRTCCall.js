import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import config from '../config';
import './CloudflareVideoCall.css';

const RobustWebRTCCall = ({ callId, user, onEndCall }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteCameraStream, setRemoteCameraStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(600);
  const [connectionState, setConnectionState] = useState('connecting');
  const [isVisitorMode, setIsVisitorMode] = useState(false);
  const [canToggleMedia, setCanToggleMedia] = useState(true);

  const localVideoRef = useRef();
  const remoteCameraRef = useRef();
  const remoteScreenRef = useRef();
  const remoteAudioRef = useRef();
  const remoteAudioStreamRef = useRef(new MediaStream());
  const peerConnectionRef = useRef();
  const socketRef = useRef();
  const dataChannelRef = useRef();
  const timerRef = useRef();

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:relay1.expressturn.com:3480',
      username: '000000002074822364',
      credential: 'WnbuuoA398ZVw+A920nzNkU8eiw='
    }
  ];

  useEffect(() => {
    // Check for existing media streams and clean them up
    const cleanupExistingStreams = async () => {
      try {
        // Get all active media streams
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        
        console.log(`📹 Available devices: ${videoDevices.length} cameras, ${audioDevices.length} microphones`);
        
        if (videoDevices.length === 0) {
          console.warn('⚠️ No camera devices found');
        }
        if (audioDevices.length === 0) {
          console.warn('⚠️ No microphone devices found');
        }
        
        // Stop any existing streams in other components
        if (window.activeMediaStreams) {
          console.log(`🚫 Stopping ${window.activeMediaStreams.length} existing media streams`);
          window.activeMediaStreams.forEach(stream => {
            stream.getTracks().forEach(track => {
              track.stop();
              console.log(`🚫 Stopped existing ${track.kind} track`);
            });
          });
          window.activeMediaStreams = [];
        }
        
        // Initialize tracking array
        if (!window.activeMediaStreams) {
          window.activeMediaStreams = [];
        }
        
        // Wait a bit for devices to be released
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.warn('Could not enumerate devices:', error);
      }
    };
    
    cleanupExistingStreams().then(() => {
      initializeCall();
    });
    
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
      
      // Stop any existing streams first
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Show permission dialog that requires camera + mic (viewer option removed)
      const userChoice = await new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'media-permission-overlay';
        dialog.innerHTML = `
          <div class="media-permission-dialog">
            <div class="permission-header">
              <div class="permission-icon-large">🎥</div>
              <h3>Join Meeting</h3>
              <p>Your camera and microphone will be turned ON for this meeting.</p>
            </div>
            <div style="margin-top:18px; color:#444;">By joining you consent to share audio and video during this session.</div>
            <div style="margin-top:20px; display:flex; gap:12px; justify-content:center;">
              <button class="permission-join-btn">Join with Camera & Mic</button>
            </div>
          </div>
        `;
        document.body.appendChild(dialog);
        dialog.querySelector('.permission-join-btn').onclick = () => {
          document.body.removeChild(dialog);
          resolve(true);
        };
      });

      let stream;
      // Require camera+mic; abort if permission denied
      if (userChoice) {
        try {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          
          const constraints = {
            video: {
              width: { ideal: 641, max: 1280 },
              height: { ideal: 480, max: 720 },
              aspectRatio: { ideal: 4/3, min: 1.2, max: 1.8 },
              frameRate: { ideal: 24, max: 30 },
              facingMode: isMobile ? 'user' : undefined
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          };
          
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log('✅ Full media access successful');
        } catch (error) {
          console.error('Media access failed — camera & mic are required:', error);
          alert('Camera and microphone access are required to join this meeting. Please allow permissions and reload.');
          return; // abort initialization
        }
      }
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        // Force aspect ratio for consistent display
        localVideoRef.current.style.objectFit = 'cover';
      }
      
      // Track this stream globally to prevent conflicts
      if (!window.activeMediaStreams) {
        window.activeMediaStreams = [];
      }
      window.activeMediaStreams.push(stream);

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;

      // Add tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote tracks (audio and video), separate screen vs camera
      pc.ontrack = (event) => {
        const track = event.track;
        try {
          if (track.kind === 'audio') {
            // aggregate remote audio tracks into a single audio element
            try {
              remoteAudioStreamRef.current.addTrack(track);
              if (!remoteStream) setRemoteStream(remoteAudioStreamRef.current);
              if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteAudioStreamRef.current;
                const p = remoteAudioRef.current.play();
                if (p && p.catch) p.catch(e => console.warn('Remote audio play prevented:', e));
              }
            } catch (e) {
              console.warn('Failed to attach remote audio track:', e);
            }
            return;
          }

          // Video track - detect screen vs camera
          const settings = track.getSettings ? track.getSettings() : {};
          const label = track.label || '';
          let isScreen = false;
          if (settings.displaySurface) {
            isScreen = ['monitor', 'window', 'application'].includes(settings.displaySurface);
          }
          if (!isScreen && /screen|display|window/i.test(label)) isScreen = true;

          const streamForTrack = new MediaStream([track]);
          if (isScreen) {
            setRemoteScreenStream(streamForTrack);
            if (remoteScreenRef.current) remoteScreenRef.current.srcObject = streamForTrack;
            if (!remoteStream) setRemoteStream(streamForTrack);
          } else {
            setRemoteCameraStream(streamForTrack);
            if (remoteCameraRef.current) remoteCameraRef.current.srcObject = streamForTrack;
            // if no screen is showing, show camera in main
            if (!remoteScreenStream && remoteScreenRef.current) remoteScreenRef.current.srcObject = streamForTrack;
            if (!remoteStream) setRemoteStream(streamForTrack);
          }
        } catch (err) {
          console.warn('Error processing incoming track:', err);
        }
      };

      // Connection state monitoring with detailed logging
      pc.onconnectionstatechange = () => {
        console.log(`🔗 ${user.role} Connection state changed:`, pc.connectionState);
        setConnectionState(pc.connectionState);
        
        if (pc.connectionState === 'connected') {
          console.log(`✅ 🎉 ${user.role.toUpperCase()} SUCCESSFULLY CONNECTED!`);
          setIsConnected(true);
        } else if (pc.connectionState === 'failed') {
          console.error(`❌ ${user.role} WebRTC connection FAILED`);
          setIsConnected(false);
        } else if (pc.connectionState === 'disconnected') {
          console.log(`🔌 ${user.role} WebRTC disconnected`);
          setIsConnected(false);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`🧊 ${user.role} ICE connection state:`, pc.iceConnectionState);
        
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          console.log(`✅ ${user.role} ICE connection established!`);
        } else if (pc.iceConnectionState === 'failed') {
          console.error(`❌ ${user.role} ICE connection failed!`);
        }
      };

      // Setup Socket.IO
      await setupSocket(pc);

      // Setup data channel
      setupDataChannel(pc);

    } catch (error) {
      console.error('❌ Failed to initialize call:', error);
      let errorMessage = 'Failed to access camera/microphone. ';
      
      if (error.name === 'NotReadableError') {
        errorMessage = 'Camera/microphone is being used by another application. Please close other video apps (including other browser tabs with video calls) and try again.';
      } else if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera/microphone access denied. Please allow permissions and refresh the page.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera/microphone found. Please connect a camera and microphone.';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please check permissions and try again.';
      }
      
      alert(errorMessage);
      
      // Try to continue without media for debugging
      try {
        console.log('🔄 Attempting to continue without media for debugging...');
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;
        await setupSocket(pc);
        setupDataChannel(pc);
      } catch (fallbackError) {
        console.error('❌ Fallback initialization also failed:', fallbackError);
      }
    }
  };

  const setupSocket = async (pc) => {
    return new Promise((resolve, reject) => {
      const socket = io(config.SOCKET_URL, {
        transports: ['polling'],
        timeout: 30000,
        forceNew: false,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log(`✅ ${user.role} socket connected for call ${callId}`);
        
        // Join rooms immediately - no delay needed
        socket.emit('join_user_room', user.id);
        socket.emit('join_call', callId);
        console.log(`🏠 ${user.role} attempting to join rooms: user_${user.id}, call_${callId}`);
        
        // Confirm room joining
        setTimeout(() => {
          console.log(`🔍 ${user.role} confirming room membership...`);
          setupSignaling(pc, socket);
          resolve();
        }, 100);
      });

      socket.on('connect_error', (error) => {
        console.error('❌ Socket connection failed:', error);
        reject(error);
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`🔌 ${user.role} socket disconnected:`, reason);
      });
    });
  };

  const setupSignaling = (pc, socket) => {
    console.log(`🔌 Setting up signaling for ${user.role} in call ${callId}`);
    
    // ICE candidates with detailed logging
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ${user.role} sending ICE candidate:`, event.candidate.type);
        socket.emit('ice_candidate', {
          callId,
          candidate: event.candidate,
          from: user.id,
          role: user.role
        });
      } else {
        console.log(`🧊 ${user.role} ICE gathering complete`);
      }
    };

    // Detailed connection state logging
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ${user.role} ICE connection state: ${pc.iceConnectionState}`);
    };
    
    pc.onicegatheringstatechange = () => {
      console.log(`🧊 ${user.role} ICE gathering state: ${pc.iceGatheringState}`);
    };
    
    pc.onsignalingstatechange = () => {
      console.log(`📡 ${user.role} signaling state: ${pc.signalingState}`);
    };

    // Room join confirmation
    socket.on('room_joined', (data) => {
      console.log(`✅ ${user.role} CONFIRMED joined room ${data.room}, participants: ${data.participantCount}`);
    });
    
    // Participant tracking
    socket.on('participant_joined', (data) => {
      console.log(`👥 Another participant joined call ${data.callId}, total: ${data.participantCount}`);
      if (data.participantCount >= 2 && user.role === 'mentor') {
        console.log('📤 Both participants ready, mentor will create offer in 3 seconds...');
      }
      // Update UI for mentee when mentor joins
      if (user.role === 'mentee') {
        setConnectionState('connecting');
      }
    });

    // Handle signaling events with detailed logging
    socket.on('offer', async (data) => {
      console.log(`📨 ${user.role} received offer from user ${data.from} for call ${data.callId}`);
      console.log('Offer details:', { callId: data.callId, from: data.from, myId: user.id, myRole: user.role });
      console.log('Offer SDP preview:', data.offer?.sdp?.substring(0, 100) + '...');
      
      if (data.callId == callId && data.from !== user.id && user.role === 'mentee') {
        console.log('📨 ✅ Mentee processing offer...');
        try {
          console.log('📨 PC state before processing:', {
            signalingState: pc.signalingState,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState
          });
          
          console.log('📨 Setting remote description...');
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          console.log('📨 ✅ Remote description set successfully');
          
          console.log('📨 Creating answer...');
          const answer = await pc.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          console.log('📨 ✅ Answer created successfully');
          
          console.log('📨 Setting local description...');
          await pc.setLocalDescription(answer);
          console.log('📨 ✅ Local description set successfully');
          
          console.log('📤 Sending answer...');
          console.log('Answer SDP preview:', answer.sdp.substring(0, 100) + '...');
          socket.emit('answer', { 
            callId, 
            answer, 
            from: user.id, 
            role: user.role,
            timestamp: Date.now()
          });
          console.log('✅ 📤 ANSWER SENT SUCCESSFULLY TO MENTOR!');
        } catch (error) {
          console.error('❌ Error handling offer:', error);
          console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
          });
        }
      } else {
        console.log('📨 ❌ Ignoring offer - conditions not met:', {
          callIdMatch: data.callId == callId,
          notFromSelf: data.from !== user.id,
          isMentee: user.role === 'mentee'
        });
      }
    });
    
    // Backup global offer handler
    socket.on('global_offer', async (data) => {
      console.log(`📡 ${user.role} received GLOBAL offer from user ${data.from} for call ${data.callId}`);
      if (data.callId == callId && data.from !== user.id && user.role === 'mentee') {
        console.log('📡 ✅ Processing global offer as backup...');
        // Reuse the same processing logic
        socket.emit('offer', data);
      }
    });

    socket.on('answer', async (data) => {
      console.log(`📨 ${user.role} received answer from user ${data.from} for call ${data.callId}`);
      console.log('Answer details:', { callId: data.callId, from: data.from, myId: user.id, myRole: user.role });
      
      if (data.callId == callId && data.from !== user.id && user.role === 'mentor') {
        console.log('📨 ✅ Mentor processing answer...');
        try {
          console.log('📨 Setting remote description from answer...');
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log('✅ Answer processed successfully - WebRTC connection should establish');
        } catch (error) {
          console.error('❌ Error handling answer:', error);
        }
      } else {
        console.log('📨 ❌ Ignoring answer - not for this mentor or wrong role');
      }
    });

    socket.on('ice_candidate', async (data) => {
      console.log(`🧊 ${user.role} received ICE candidate from ${data.role} (user ${data.from})`);
      if (data.callId == callId && data.from !== user.id) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log(`✅ ICE candidate added successfully`);
        } catch (error) {
          console.error('❌ ICE candidate error:', error);
        }
      }
    });

    // Chat messages with logging
    socket.on('chat_message', (data) => {
      if (data.callId == callId && data.from !== user.id) {
        console.log('💬 Received chat message from:', data.from);
        setMessages(prev => [...prev, data.message]);
      }
    });

    // Timer sync
    socket.on('timer_sync', (data) => {
      if (data.callId == callId && data.from !== user.id) {
        console.log('⏱️ Timer sync received:', data.timeLeft);
        setTimeLeft(data.timeLeft);
      }
    });

    // Start signaling if mentor (wait for room confirmation)
    if (user.role === 'mentor') {
      console.log('📤 Mentor will create offer after room confirmation...');
      
      let offerSent = false;
      
      // Wait for room join confirmation, then create offer
      const createOfferHandler = async () => {
        if (offerSent) {
          console.log('📤 Offer already sent, skipping...');
          return;
        }
        

        
        setTimeout(async () => {
          try {
            console.log('📤 🚀 MENTOR CREATING OFFER NOW...');
            console.log('PC state before offer:', {
              signalingState: pc.signalingState,
              connectionState: pc.connectionState,
              iceConnectionState: pc.iceConnectionState
            });
            
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            console.log('📤 Offer created, setting local description...');
            await pc.setLocalDescription(offer);
            console.log('📤 ✅ Local description set successfully');
            
            console.log('📤 Sending offer to mentee...');
            console.log('Offer SDP preview:', offer.sdp.substring(0, 100) + '...');
            
            // Send offer multiple times to ensure delivery
            const offerData = { 
              callId, 
              offer, 
              from: user.id, 
              role: user.role,
              timestamp: Date.now()
            };
            
            socket.emit('offer', offerData);
            
            // Retry offer sending with connection state check
            let retryCount = 0;
            const retryInterval = setInterval(() => {
              if (retryCount < 3 && pc.connectionState !== 'connected') {
                console.log(`📤 Retrying offer send (${retryCount + 1}/3)...`);
                socket.emit('offer', offerData);
                retryCount++;
              } else {
                clearInterval(retryInterval);
              }
            }, 1500);
            
            offerSent = true;
            console.log('✅ 📤 OFFER SENT SUCCESSFULLY TO MENTEE!');
          } catch (error) {
            console.error('❌ 📤 FAILED TO CREATE/SEND OFFER:', error);
            console.error('Error details:', {
              name: error.name,
              message: error.message,
              stack: error.stack
            });
          }
        }, 3000); // 3 second delay to wait for mentee
      };
      
      socket.on('room_joined', createOfferHandler);
      
      // Also try when participant joins (backup)
      socket.on('participant_joined', (data) => {
        if (data.participantCount >= 2) {
          console.log('📤 Participant joined, mentor will create offer...');
          // Wait a bit for mentee to be ready, then send offer
          setTimeout(() => {
            if (!offerSent) {
              createOfferHandler();
            } else {
              // Resend existing offer to new participant
              console.log('📤 Resending offer to new participant...');
              if (pc.localDescription) {
                socket.emit('offer', { 
                  callId, 
                  offer: pc.localDescription, 
                  from: user.id, 
                  role: user.role,
                  timestamp: Date.now()
                });
              }
            }
          }, 1000);
        }
      });
    } else {
      console.log('📨 Mentee waiting for offer from mentor...');
      
      // Add timeout for mentee if no offer received
      setTimeout(() => {
        if (pc.signalingState === 'stable' && !remoteStream) {
          console.log('⚠️ No offer received after 10 seconds, mentee may need to refresh');
        }
      }, 10000);
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

  const toggleMute = async () => {
    if (localStream && localStream.getAudioTracks().length > 0) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    } else if (isVisitorMode || canToggleMedia) {
      // Enable audio for visitor mode
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTrack = audioStream.getAudioTracks()[0];
        
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) {
            await sender.replaceTrack(audioTrack);
          } else {
            peerConnectionRef.current.addTrack(audioTrack, localStream || new MediaStream());
          }
        }
        
        if (!localStream) {
          const newStream = new MediaStream([audioTrack]);
          setLocalStream(newStream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = newStream;
          }
        } else {
          localStream.addTrack(audioTrack);
        }
        
        setIsMuted(false);
        setIsVisitorMode(false);
      } catch (error) {
        console.error('Failed to enable audio:', error);
        alert('Failed to enable microphone. Please check permissions.');
      }
    }
  };

  const toggleVideo = async () => {
    if (localStream && localStream.getVideoTracks().length > 0) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    } else if (isVisitorMode || canToggleMedia) {
      // Enable video for visitor mode
      try {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            aspectRatio: { ideal: 4/3, min: 1.2, max: 1.8 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: isMobile ? 'user' : undefined
          }
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            await sender.replaceTrack(videoTrack);
          } else {
            peerConnectionRef.current.addTrack(videoTrack, localStream || new MediaStream());
          }
        }
        
        if (!localStream) {
          const newStream = new MediaStream([videoTrack]);
          setLocalStream(newStream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = newStream;
            localVideoRef.current.style.objectFit = 'cover';
          }
        } else {
          localStream.addTrack(videoTrack);
        }
        
        setIsVideoOff(false);
        setIsVisitorMode(false);
      } catch (error) {
        console.error('Failed to enable video:', error);
        alert('Failed to enable camera. Please check permissions.');
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
        // Replace the existing video sender so camera is hidden while screen is shared
        const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
          // mark so stopScreenShare knows to restore camera
          peerConnectionRef.current._screenReplaced = true;
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
    try {
      // If we replaced the sender earlier, restore camera by replacing with local video track
      if (peerConnectionRef.current && peerConnectionRef.current._screenReplaced && localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && videoTrack) await sender.replaceTrack(videoTrack);
        peerConnectionRef.current._screenReplaced = false;
      }
    } catch (err) {
      console.warn('Error restoring camera after screen share:', err);
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

      console.log(`💬 ${user.role} sending message:`, message.text);
      
      let sentViaDataChannel = false;
      let sentViaSocket = false;

      // Try data channel first
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try {
          dataChannelRef.current.send(JSON.stringify(message));
          console.log('✅ Message sent via data channel');
          sentViaDataChannel = true;
        } catch (error) {
          console.error('❌ Data channel send failed:', error);
        }
      } else {
        console.log('❌ Data channel not available, state:', dataChannelRef.current?.readyState);
      }

      // Send via socket (always as backup)
      if (socketRef.current && socketRef.current.connected) {
        try {
          socketRef.current.emit('chat_message', {
            callId,
            message,
            from: user.id,
            role: user.role
          });
          console.log('✅ Message sent via socket');
          sentViaSocket = true;
        } catch (error) {
          console.error('❌ Socket send failed:', error);
        }
      } else {
        console.log('❌ Socket not connected');
      }
      
      if (!sentViaDataChannel && !sentViaSocket) {
        console.error('❌ Message failed to send via both channels!');
        alert('Message failed to send. Connection issue.');
        return;
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
      localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`🚫 Stopped ${track.kind} track`);
      });
      
      // Remove from global tracking
      if (window.activeMediaStreams) {
        const index = window.activeMediaStreams.indexOf(localStream);
        if (index > -1) {
          window.activeMediaStreams.splice(index, 1);
        }
      }
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
            <div className="remote-video-container">
              {/* Main remote display: prefers screen share when available */}
              <video ref={remoteScreenRef} autoPlay playsInline className="remote-main-video" />

              {/* Picture-in-picture: remote camera */}
              <video ref={remoteCameraRef} autoPlay playsInline className="remote-pip-video" />

              {/* Hidden audio element to ensure remote audio plays reliably */}
              <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
            </div>
          {!remoteStream && (
            <div className="waiting-message">
              <div className="waiting-icon">👥</div>
              <div className="waiting-text">
                {user.role === 'mentor' ? 'Waiting for mentee to join...' : 'Waiting for mentor to join...'}
              </div>
              <div className="connection-status">
                <span className={`status-indicator ${connectionState}`}></span>
                {connectionState === 'connecting' ? 'Connecting...' : 
                 connectionState === 'connected' ? 'Connected' :
                 connectionState === 'failed' ? 'Connection Failed' : 'Waiting...'}
              </div>
              <div className="user-info">
                <small>You are joining as: {user.role} {isVisitorMode ? '(Visitor Mode)' : ''}</small>
              </div>
            </div>
          )}
        </div>
        
        <div className="local-video">
          <video ref={localVideoRef} autoPlay playsInline muted style={{ objectFit: 'cover' }} />
          {(!localStream?.getVideoTracks()?.length || isVideoOff) && (
            <div className="camera-off-overlay">
              <div className="camera-off-icon">📷</div>
              <span>{isVisitorMode ? 'Visitor Mode' : 'Camera Off'}</span>
            </div>
          )}
          <div className="local-user-info">
            <span>{user.role === 'mentor' ? 'Mentor' : 'Mentee'} (You)</span>
            {isVisitorMode && <span className="visitor-badge">Visitor</span>}
          </div>
        </div>
      </div>

      <div className="call-controls">
        <div className="timer">
          <span className={timeLeft < 60 ? 'warning' : ''}>
            {formatTime(timeLeft)}
          </span>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            {user.role} | {connectionState}
          </div>
        </div>

        <div className="control-buttons">
          <button 
            onClick={toggleMute}
            className={`control-btn ${isMuted || (!localStream?.getAudioTracks()?.length && !isVisitorMode) ? 'muted' : ''}`}
            title={isMuted || (!localStream?.getAudioTracks()?.length && !isVisitorMode) ? 'Enable Microphone' : 'Mute'}
          >
            {isMuted || (!localStream?.getAudioTracks()?.length && !isVisitorMode) ? '🔇' : '🎤'}
          </button>
          
          <button 
            onClick={toggleVideo}
            className={`control-btn ${isVideoOff || (!localStream?.getVideoTracks()?.length && !isVisitorMode) ? 'video-off' : ''}`}
            title={isVideoOff || (!localStream?.getVideoTracks()?.length && !isVisitorMode) ? 'Enable Camera' : 'Turn off video'}
          >
            {isVideoOff || (!localStream?.getVideoTracks()?.length && !isVisitorMode) ? '📹' : '📷'}
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
            {isConnected ? '🟢 Connected' : connectionState === 'connecting' ? '🟡 Connecting...' : connectionState === 'failed' ? '🔴 Failed' : '🟡 Waiting...'}
          </span>
          {connectionState === 'failed' && (
            <button 
              onClick={() => window.location.reload()} 
              className="retry-btn"
              style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px' }}
            >
              Retry
            </button>
          )}
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
            disabled={!newMessage.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default RobustWebRTCCall;