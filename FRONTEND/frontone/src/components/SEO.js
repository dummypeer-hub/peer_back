import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({ 
  title = "PeerVerse - Connect with Expert Mentors | Online Mentorship Platform",
  description = "Join PeerVerse, India's leading mentorship platform. Connect with expert mentors for career guidance, skill development, interview preparation, and academic support.",
  keywords = "mentorship platform, online mentoring, career guidance, skill development, interview preparation, academic support, expert mentors, professional development, learning platform, career coaching, study help, placement preparation, coding mentorship, project guidance, hackathon support, college reviews, career advice, personal growth, skill learning, mentor matching",
  image = "/final_logooooo_peerverse.png",
  url = "https://www.peerverse.in",
  type = "website"
}) => {
  const fullTitle = title.includes('PeerVerse') ? title : `${title} | PeerVerse`;
  const fullUrl = url.startsWith('http') ? url : `https://www.peerverse.in${url}`;
  const fullImage = image.startsWith('http') ? image : `https://www.peerverse.in${image}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:site_name" content="PeerVerse" />
      <meta property="og:locale" content="en_IN" />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={fullUrl} />
      <meta property="twitter:title" content={fullTitle} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={fullImage} />

      {/* Additional Meta Tags */}
      <meta name="robots" content="index, follow" />
      <meta name="author" content="PeerVerse" />
      <meta name="application-name" content="PeerVerse" />
    </Helmet>
  );
};

export default SEO;