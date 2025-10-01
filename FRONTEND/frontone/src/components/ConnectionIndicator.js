import React, { useState, useEffect } from 'react';

const ConnectionIndicator = ({ peerConnection, isConnected }) => {
  const [connectionQuality, setConnectionQuality] = useState('unknown');
  const [stats, setStats] = useState({});

  useEffect(() => {
    if (!peerConnection || !isConnected) return;

    const interval = setInterval(async () => {
      try {
        const stats = await peerConnection.getStats();
        let inboundRtp = null;
        let outboundRtp = null;

        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            inboundRtp = report;
          }
          if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
            outboundRtp = report;
          }
        });

        if (inboundRtp) {
          const quality = getConnectionQuality(inboundRtp);
          setConnectionQuality(quality);
          setStats({
            packetsLost: inboundRtp.packetsLost || 0,
            packetsReceived: inboundRtp.packetsReceived || 0,
            bytesReceived: inboundRtp.bytesReceived || 0
          });
        }
      } catch (error) {
        console.error('Error getting connection stats:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [peerConnection, isConnected]);

  const getConnectionQuality = (report) => {
    const packetLossRate = report.packetsLost / (report.packetsReceived + report.packetsLost);
    
    if (packetLossRate < 0.02) return 'excellent';
    if (packetLossRate < 0.05) return 'good';
    if (packetLossRate < 0.1) return 'fair';
    return 'poor';
  };

  const getIndicatorColor = () => {
    switch (connectionQuality) {
      case 'excellent': return '#4CAF50';
      case 'good': return '#8BC34A';
      case 'fair': return '#FF9800';
      case 'poor': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getIndicatorText = () => {
    if (!isConnected) return 'Connecting...';
    
    switch (connectionQuality) {
      case 'excellent': return 'Excellent';
      case 'good': return 'Good';
      case 'fair': return 'Fair';
      case 'poor': return 'Poor';
      default: return 'Unknown';
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      left: '10px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      zIndex: 1000
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: getIndicatorColor()
      }} />
      <span>{getIndicatorText()}</span>
      {stats.packetsLost > 0 && (
        <span style={{ fontSize: '10px', opacity: 0.8 }}>
          ({stats.packetsLost} lost)
        </span>
      )}
    </div>
  );
};

export default ConnectionIndicator;