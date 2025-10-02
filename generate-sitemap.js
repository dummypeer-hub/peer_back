const fs = require('fs');
const path = require('path');

// Configuration
const DOMAIN = 'https://peerverse.in';
const OUTPUT_PATH = './FRONTEND/frontone/public/sitemap.xml';

// Define your site URLs with metadata
const urls = [
  {
    loc: '/',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'weekly',
    priority: '1.0'
  },
  {
    loc: '/login',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'monthly',
    priority: '0.8'
  },
  {
    loc: '/signup',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'monthly',
    priority: '0.8'
  },
  {
    loc: '/dashboard',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'daily',
    priority: '0.9'
  },
  {
    loc: '/features',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'monthly',
    priority: '0.7'
  },
  {
    loc: '/how-it-works',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'monthly',
    priority: '0.7'
  },
  {
    loc: '/about',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'monthly',
    priority: '0.6'
  },
  {
    loc: '/contact',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'monthly',
    priority: '0.6'
  }
];

// Generate XML sitemap
function generateSitemap() {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  urls.forEach(url => {
    xml += '  <url>\n';
    xml += `    <loc>${DOMAIN}${url.loc}</loc>\n`;
    xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    xml += `    <priority>${url.priority}</priority>\n`;
    xml += '  </url>\n';
  });
  
  xml += '</urlset>';
  
  return xml;
}

// Write sitemap to file
function writeSitemap() {
  try {
    const sitemap = generateSitemap();
    
    // Ensure directory exists
    const dir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_PATH, sitemap, 'utf8');
    console.log('✅ Sitemap generated successfully!');
    console.log(`📍 Location: ${OUTPUT_PATH}`);
    console.log(`🔗 Submit to Google: ${DOMAIN}/sitemap.xml`);
    
    // Display sitemap content
    console.log('\n📄 Sitemap content:');
    console.log(sitemap);
    
  } catch (error) {
    console.error('❌ Error generating sitemap:', error);
  }
}

// Run the script
writeSitemap();