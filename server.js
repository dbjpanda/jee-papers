import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DIST_DIR = path.join(__dirname, 'dist');

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

/**
 * Serve static files
 */
async function serveFile(filePath, res) {
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const mimeType = mimeTypes[ext] || 'text/plain';
    
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - File Not Found</h1>');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>500 - Internal Server Error</h1>');
    }
  }
}

/**
 * Create HTTP server
 */
const server = http.createServer(async (req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Prevent directory traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 - Forbidden</h1>');
    return;
  }
  
  // Check if path is a directory
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (error) {
    // File doesn't exist, will be handled by serveFile
  }
  
  await serveFile(filePath, res);
});

/**
 * Start server
 */
server.listen(PORT, async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 JEE Exam Papers Server');
  console.log('='.repeat(60));
  console.log(`\n✓ Server is running at: http://localhost:${PORT}`);
  console.log(`\n📂 Serving files from: ${DIST_DIR}`);
  
  // Check if dist folder exists
  try {
    await fs.access(DIST_DIR);
  } catch {
    console.log('\n⚠️  WARNING: dist folder not found!');
    console.log('   Run "npm run build" first to generate the static site.\n');
  }
  
  console.log(`\nPress Ctrl+C to stop the server\n`);
});

/**
 * Handle server errors
 */
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use.`);
    console.error('Please stop the other server or use a different port.\n');
  } else {
    console.error('\n❌ Server error:', error.message, '\n');
  }
  process.exit(1);
});

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server...');
  server.close(() => {
    console.log('✓ Server closed successfully\n');
    process.exit(0);
  });
});

