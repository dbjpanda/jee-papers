import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const HTML_DIR = path.join(ROOT_DIR, 'html');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

/**
 * Parse exam key to get metadata
 */
function parseExamKey(filename) {
  const key = filename.replace('.html', '');
  const parts = key.split('-');
  
  let year = null;
  let examType = '';
  let date = '';
  let shift = '';
  
  // Extract exam type
  if (parts[0] === 'jee' && parts[1] === 'main') {
    examType = 'JEE Main';
  } else if (parts[0] === 'jee' && parts[1] === 'advanced') {
    examType = 'JEE Advanced';
  } else if (parts[0] === 'iit' && parts[1] === 'jee') {
    examType = 'IIT JEE';
  } else if (parts[0] === 'aieee') {
    examType = 'AIEEE';
  }
  
  // Extract year
  const yearMatch = key.match(/(\d{4})/);
  if (yearMatch) {
    year = parseInt(yearMatch[1]);
  }
  
  // Extract date
  const dateMatch = key.match(/(\d+)(?:st|nd|rd|th)-(\w+)/);
  if (dateMatch) {
    date = `${dateMatch[1]} ${dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1)}`;
  }
  
  // Extract shift
  if (key.includes('morning')) {
    shift = 'Morning';
  } else if (key.includes('evening')) {
    shift = 'Evening';
  } else if (key.includes('afternoon')) {
    shift = 'Afternoon';
  }
  
  // Extract paper info for advanced
  const paperMatch = key.match(/paper-(\d+)/);
  const paper = paperMatch ? `Paper ${paperMatch[1]}` : '';
  
  // Build title
  let title = examType;
  if (year) title += ` ${year}`;
  if (paper) title += ` ${paper}`;
  if (date) title += ` - ${date}`;
  if (shift) title += ` ${shift} Shift`;
  
  return { key, title, year, examType };
}

/**
 * Get all HTML files organized by exam type
 */
async function getOrganizedHtmlFiles() {
  const organized = {
    'jee-main': [],
    'jee-advanced': []
  };
  
  try {
    const examTypes = await fs.readdir(HTML_DIR);
    
    for (const examType of examTypes) {
      const examDir = path.join(HTML_DIR, examType);
      const stats = await fs.stat(examDir);
      
      if (stats.isDirectory()) {
        const files = await fs.readdir(examDir);
        const htmlFiles = files.filter(f => f.endsWith('.html'));
        
        organized[examType] = htmlFiles.map(file => {
          const metadata = parseExamKey(file);
          return {
            ...metadata,
            path: `html/${examType}/${file}`
          };
        });
        
        // Sort by year (descending) and then by title
        organized[examType].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return a.title.localeCompare(b.title);
        });
      }
    }
  } catch (error) {
    console.error('Error reading HTML files:', error.message);
  }
  
  return organized;
}

/**
 * Generate HTML index page
 */
function generateIndexHtml(organized) {
  const totalFiles = Object.values(organized).reduce((sum, arr) => sum + arr.length, 0);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Complete collection of JEE Main and JEE Advanced past year papers with solutions">
  <meta name="keywords" content="JEE Main, JEE Advanced, IIT JEE, AIEEE, past papers, exam papers">
  <title>JEE Exam Papers - Complete Collection</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    
    header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    header p {
      font-size: 1.1rem;
      opacity: 0.95;
    }
    
    .stats {
      display: flex;
      justify-content: center;
      gap: 40px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    
    .stat {
      text-align: center;
    }
    
    .stat-number {
      font-size: 2rem;
      font-weight: bold;
      display: block;
    }
    
    .stat-label {
      font-size: 0.9rem;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .content {
      padding: 40px;
    }
    
    .section {
      margin-bottom: 50px;
    }
    
    .section-header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 25px;
      padding-bottom: 15px;
      border-bottom: 3px solid #667eea;
    }
    
    .section-header h2 {
      font-size: 1.8rem;
      color: #667eea;
      font-weight: 700;
    }
    
    .section-badge {
      background: #667eea;
      color: white;
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 0.9rem;
      font-weight: 600;
    }
    
    .exam-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
    }
    
    .exam-card {
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.3s ease;
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      display: block;
    }
    
    .exam-card:hover {
      border-color: #667eea;
      transform: translateY(-5px);
      box-shadow: 0 10px 25px rgba(102, 126, 234, 0.2);
    }
    
    .exam-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 8px;
      line-height: 1.4;
    }
    
    .exam-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    
    .exam-tag {
      background: #edf2f7;
      color: #4a5568;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    
    .exam-tag.year {
      background: #667eea;
      color: white;
    }
    
    .search-box {
      margin-bottom: 30px;
      position: relative;
    }
    
    .search-box input {
      width: 100%;
      padding: 15px 20px;
      font-size: 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      outline: none;
      transition: all 0.3s ease;
    }
    
    .search-box input:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .search-icon {
      position: absolute;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      color: #a0aec0;
    }
    
    .no-results {
      text-align: center;
      padding: 40px;
      color: #718096;
      font-size: 1.1rem;
    }
    
    footer {
      background: #f7fafc;
      padding: 30px;
      text-align: center;
      color: #718096;
      border-top: 1px solid #e2e8f0;
    }
    
    @media (max-width: 768px) {
      header h1 {
        font-size: 1.8rem;
      }
      
      .exam-grid {
        grid-template-columns: 1fr;
      }
      
      .stats {
        gap: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎓 JEE Exam Papers</h1>
      <p>Complete Collection of Past Year Papers</p>
      <div class="stats">
        <div class="stat">
          <span class="stat-number">${totalFiles}</span>
          <span class="stat-label">Total Papers</span>
        </div>
        <div class="stat">
          <span class="stat-number">${organized['jee-main'].length}</span>
          <span class="stat-label">JEE Main</span>
        </div>
        <div class="stat">
          <span class="stat-number">${organized['jee-advanced'].length}</span>
          <span class="stat-label">JEE Advanced</span>
        </div>
      </div>
    </header>
    
    <div class="content">
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Search exams by year, type, or date...">
        <span class="search-icon">🔍</span>
      </div>
      
      ${Object.entries(organized).map(([examType, exams]) => {
        if (exams.length === 0) return '';
        
        const displayName = examType === 'jee-main' ? 'JEE Main & AIEEE' : 'JEE Advanced & IIT JEE';
        
        return `
      <div class="section" data-exam-type="${examType}">
        <div class="section-header">
          <h2>${displayName}</h2>
          <span class="section-badge">${exams.length} Papers</span>
        </div>
        
        <div class="exam-grid" id="${examType}-grid">
          ${exams.map(exam => `
          <a href="${exam.path}" class="exam-card" data-title="${exam.title.toLowerCase()}">
            <div class="exam-title">${exam.title}</div>
            <div class="exam-meta">
              ${exam.year ? `<span class="exam-tag year">${exam.year}</span>` : ''}
              <span class="exam-tag">${exam.examType}</span>
            </div>
          </a>
          `).join('')}
        </div>
      </div>
        `;
      }).join('')}
      
      <div class="no-results" id="noResults" style="display: none;">
        No exams found matching your search.
      </div>
    </div>
    
    <footer>
      <p>Generated on ${new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}</p>
      <p style="margin-top: 10px; font-size: 0.9rem;">
        All exam papers are formatted with proper mathematical equations using MathJax
      </p>
    </footer>
  </div>
  
  <script>
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const sections = document.querySelectorAll('.section');
    const noResults = document.getElementById('noResults');
    
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      let visibleCount = 0;
      
      sections.forEach(section => {
        const cards = section.querySelectorAll('.exam-card');
        let sectionVisibleCount = 0;
        
        cards.forEach(card => {
          const title = card.getAttribute('data-title');
          if (title.includes(searchTerm)) {
            card.style.display = 'block';
            sectionVisibleCount++;
            visibleCount++;
          } else {
            card.style.display = 'none';
          }
        });
        
        section.style.display = sectionVisibleCount > 0 ? 'block' : 'none';
      });
      
      noResults.style.display = visibleCount === 0 && searchTerm !== '' ? 'block' : 'none';
    });
  </script>
</body>
</html>`;
}

/**
 * Copy directory recursively
 */
async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Clean dist directory
 */
async function cleanDist() {
  try {
    await fs.rm(DIST_DIR, { recursive: true, force: true });
    console.log('✓ Cleaned dist directory');
  } catch (error) {
    // Directory doesn't exist, that's fine
  }
}

/**
 * Main build function
 */
async function build() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('Building Static Site');
    console.log('='.repeat(60) + '\n');
    
    // Step 1: Clean dist directory
    console.log('1. Cleaning dist directory...');
    await cleanDist();
    
    // Step 2: Create dist directory
    console.log('2. Creating dist directory...');
    await fs.mkdir(DIST_DIR, { recursive: true });
    
    // Step 3: Get organized HTML files
    console.log('3. Scanning HTML files...');
    const organized = await getOrganizedHtmlFiles();
    const totalFiles = Object.values(organized).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`   Found ${totalFiles} HTML files`);
    
    // Step 4: Generate index.html
    console.log('4. Generating index.html...');
    const indexHtml = generateIndexHtml(organized);
    await fs.writeFile(path.join(DIST_DIR, 'index.html'), indexHtml, 'utf8');
    
    // Step 5: Copy html directory
    console.log('5. Copying HTML files...');
    await copyDirectory(HTML_DIR, path.join(DIST_DIR, 'html'));
    
    // Step 6: Create vercel.json
    console.log('6. Creating vercel.json...');
    const vercelConfig = {
      "buildCommand": "npm run build",
      "outputDirectory": "dist",
      "cleanUrls": true,
      "trailingSlash": false
    };
    await fs.writeFile(
      path.join(ROOT_DIR, 'vercel.json'),
      JSON.stringify(vercelConfig, null, 2),
      'utf8'
    );
    
    console.log('\n' + '='.repeat(60));
    console.log('Build Summary:');
    console.log('='.repeat(60));
    console.log(`✓ Output directory: ${DIST_DIR}`);
    console.log(`✓ Total HTML files: ${totalFiles}`);
    console.log(`✓ JEE Main papers: ${organized['jee-main'].length}`);
    console.log(`✓ JEE Advanced papers: ${organized['jee-advanced'].length}`);
    console.log('='.repeat(60));
    console.log('\n✅ Build completed successfully!\n');
    console.log('📦 Ready to deploy:');
    console.log('   - Vercel: vercel --prod');
    console.log('   - Or drag & drop the "dist" folder to any static hosting\n');
    
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run the build
build();

