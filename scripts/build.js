import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const HTML_DIR = path.join(ROOT_DIR, 'html');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const RAW_DIR = path.join(ROOT_DIR, 'raw');

/**
 * Convert chapter/topic name to readable format
 */
function toReadableFormat(text) {
  if (!text) return text;
  
  // Split by hyphen and convert to title case
  return text
    .split('-')
    .map(word => {
      // Special cases for common abbreviations
      const upperWords = ['2d', '3d', 'ac', 'dc', 'emf', 'lcr', 'nmos', 'pmos', 'led', 'lcd'];
      if (upperWords.includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      // Capitalize first letter, rest lowercase
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Parse exam key to get metadata
 */
function parseExamKey(filename) {
  const key = filename.replace('.html', '');
  const parts = key.split('-');
  
  let year = null;
  let examType = '';
  let date = '';
  let month = '';
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
  
  // Extract date and month
  const dateMatch = key.match(/(\d+)(?:st|nd|rd|th)-(\w+)/);
  if (dateMatch) {
    const day = dateMatch[1];
    const monthName = dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1);
    date = `${day} ${monthName}`;
    month = monthName;
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
  
  return { key, title, year, examType, month, date };
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
            path: `years/${examType}/${file}`
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
 * Get all questions organized by subject and chapter
 */
async function getOrganizedBySubject() {
  const subjectOrganized = {};
  
  try {
    const examTypes = await fs.readdir(RAW_DIR);
    
    for (const examType of examTypes) {
      const rawExamDir = path.join(RAW_DIR, examType);
      const stats = await fs.stat(rawExamDir);
      
      if (stats.isDirectory()) {
        const files = await fs.readdir(rawExamDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        for (const file of jsonFiles) {
          const key = file.replace('.json', '');
          const metadata = parseExamKey(file);
          const rawFilePath = path.join(rawExamDir, file);
          
          try {
            const rawData = JSON.parse(await fs.readFile(rawFilePath, 'utf8'));
            
            if (rawData.results && Array.isArray(rawData.results)) {
              let questionCounter = 0;
              
              rawData.results.forEach(subjectData => {
                const subjectName = subjectData._id;
                
                if (!subjectOrganized[subjectName]) {
                  subjectOrganized[subjectName] = {};
                }
                
                if (subjectData.questions && Array.isArray(subjectData.questions)) {
                  subjectData.questions.forEach(question => {
                    questionCounter++;
                    const chapter = question.chapter || 'Uncategorized';
                    
                    if (!subjectOrganized[subjectName][chapter]) {
                      subjectOrganized[subjectName][chapter] = [];
                    }
                    
                    // Store individual question data
                    subjectOrganized[subjectName][chapter].push({
                      examKey: key,
                      examTitle: metadata.title,
                      year: metadata.year,
                      examType: metadata.examType,
                      subject: subjectName,
                      chapter: chapter,
                      questionNumber: questionCounter,
                      question: question
                    });
                  });
                }
              });
            }
          } catch (error) {
            console.warn(`Warning: Could not read ${file}:`, error.message);
          }
        }
      }
    }
    
    // Sort questions within each chapter by year (descending) and question number
    Object.keys(subjectOrganized).forEach(subject => {
      Object.keys(subjectOrganized[subject]).forEach(chapter => {
        subjectOrganized[subject][chapter].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.examKey !== b.examKey) return a.examKey.localeCompare(b.examKey);
          return a.questionNumber - b.questionNumber;
        });
      });
    });
    
  } catch (error) {
    console.error('Error organizing by subject:', error.message);
  }
  
  return subjectOrganized;
}

/**
 * Generate HTML for chapter-specific question pages
 */
async function generateChapterPages(subjectOrganized) {
  const chapterDir = path.join(DIST_DIR, 'chapters');
  await fs.mkdir(chapterDir, { recursive: true });
  
  let totalPages = 0;
  
  for (const [subject, chapters] of Object.entries(subjectOrganized)) {
    const subjectDir = path.join(chapterDir, subject.toLowerCase());
    await fs.mkdir(subjectDir, { recursive: true });
    
    for (const [chapter, questions] of Object.entries(chapters)) {
      const chapterSlug = chapter.toLowerCase().replace(/\s+/g, '-');
      const htmlContent = generateChapterHtml(subject, chapter, questions);
      const filePath = path.join(subjectDir, `${chapterSlug}.html`);
      
      await fs.writeFile(filePath, htmlContent, 'utf8');
      totalPages++;
    }
  }
  
  return totalPages;
}

/**
 * Generate HTML for a chapter showing all questions
 */
function generateChapterHtml(subject, chapter, questions) {
  const readableChapter = toReadableFormat(chapter);
  const questionCount = questions.length;
  
  // Group questions by exam
  const questionsByExam = {};
  questions.forEach(q => {
    if (!questionsByExam[q.examKey]) {
      questionsByExam[q.examKey] = {
        title: q.examTitle,
        year: q.year,
        examType: q.examType,
        questions: []
      };
    }
    questionsByExam[q.examKey].questions.push(q);
  });
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${subject} - ${readableChapter} (${questionCount} Questions)</title>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
<script>
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']]
    },
    svg: {
      fontCache: 'global'
    }
  };
</script>
<style>
  body { font-family: Arial, sans-serif; max-width: 980px; margin: 40px auto; padding: 20px; line-height: 1.6; background: #f5f5f5; }
  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; }
  .header h1 { margin: 0 0 10px 0; font-size: 2rem; }
  .header p { margin: 5px 0; opacity: 0.95; }
  .back-link { display: inline-block; margin-bottom: 20px; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; }
  .back-link:hover { background: #5568d3; }
  .exam-group { margin-bottom: 40px; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .exam-header { background: #2d3748; color: white; padding: 15px 20px; font-weight: bold; font-size: 1.1rem; }
  .qwrap { margin: 20px; padding-bottom: 30px; border-bottom: 2px solid #e5e5e5; }
  .qwrap:last-child { border-bottom: none; }
  .qhead { background: #111; color: #fff; padding: 10px 14px; font-weight: bold; display: flex; align-items: center; gap: 10px; border-radius: 6px; margin-bottom: 15px; }
  .qtype { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #e0e7ff; color: #1e3a8a; }
  .question { background: #f5f5f5; padding: 16px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #FF9800; }
  .question-title { font-weight: bold; color: #333; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
  .question-content { font-size: 16px; color: #222; }
  .options { display: grid; gap: 12px; margin-bottom: 20px; }
  .option { background: #fff; padding: 12px; border-radius: 6px; border: 1.5px solid #e0e0e0; display: flex; align-items: center; }
  .option-label { background: #2196F3; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; margin-right: 12px; flex-shrink: 0; }
  .option-content { flex: 1; font-size: 16px; }
  .correct-option { background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #4CAF50; }
  .correct-title { font-weight: bold; color: #333; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; }
  .correct-answer { font-size: 16px; color: #222; font-weight: 600; }
  .correct-label { background: #4CAF50; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; margin-right: 12px; flex-shrink: 0; }
  .correct-content { flex: 1; font-size: 16px; }
  .explanation { background: #f8f9fa; padding: 16px; border-radius: 6px; border-left: 4px solid #007bff; }
  .explanation-title { font-weight: bold; color: #007bff; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
  .explanation-content { font-size: 16px; color: #222; }
  mjx-container { display: inline-block; margin: 0 2px; }
  svg, img { max-width: 100%; height: auto; }
</style>
</head>
<body>
<a href="../../index.html" class="back-link">← Back to Home</a>
<div class="header">
  <h1>${subject} - ${readableChapter}</h1>
  <p>${questionCount} Questions from ${Object.keys(questionsByExam).length} Exams</p>
</div>

${Object.entries(questionsByExam).map(([examKey, examData]) => {
  return `
<div class="exam-group">
  <div class="exam-header">${examData.title} (${examData.questions.length} Questions)</div>
  
  ${examData.questions.map((q, idx) => {
    const question = q.question;
    const correctOptions = question.question.en.correct_options || [];
    const type = question.question.en.options.length > 0 ? 'MCQ' : 'Numerical';
    
    return `
  <div class="qwrap">
    <div class="qhead">
      <div>Question ${idx + 1}</div>
      <span class="qtype">${type}</span>
    </div>
    
    <div class="question">
      <div class="question-title">Question</div>
      <div class="question-content">${question.question.en.content}</div>
    </div>
    
    ${question.question.en.options.length ? `
    <div class="options">
      ${question.question.en.options.map(opt => `
      <div class="option">
        <div class="option-label">${opt.identifier}</div>
        <div class="option-content">${opt.content}</div>
      </div>`).join('')}
    </div>` : ''}
    
    ${correctOptions.length ? `
    <div class="correct-option">
      <div class="correct-title">Correct Option</div>
      <div style="display: flex; align-items: center; margin-top: 8px;">
        <div class="correct-label">${correctOptions[0]}</div>
        <div class="correct-content">${question.question.en.options.find(o => o.identifier === correctOptions[0])?.content || correctOptions[0]}</div>
      </div>
    </div>` : ''}
    
    ${question.question.en.explanation ? `
    <div class="explanation">
      <div class="explanation-title">Explanation</div>
      <div class="explanation-content">${question.question.en.explanation}</div>
    </div>` : ''}
  </div>
    `;
  }).join('')}
</div>
  `;
}).join('')}

</body>
</html>`;
}

/**
 * Generate HTML index page
 */
function generateIndexHtml(organized, subjectOrganized) {
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
    
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 30px;
      border-bottom: 2px solid #e2e8f0;
    }
    
    .tab-button {
      padding: 12px 24px;
      font-size: 1rem;
      font-weight: 600;
      background: none;
      border: none;
      color: #718096;
      cursor: pointer;
      transition: all 0.3s ease;
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
    }
    
    .tab-button:hover {
      color: #667eea;
    }
    
    .tab-button.active {
      color: #667eea;
      border-bottom-color: #667eea;
    }
    
    .tab-content {
      display: none;
    }
    
    .tab-content.active {
      display: block;
    }
    
    .filters-box {
      margin-bottom: 30px;
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
    }
    
    .filter-group {
      flex: 1;
      min-width: 200px;
    }
    
    .filter-label {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      color: #4a5568;
      margin-bottom: 8px;
    }
    
    .filter-select {
      width: 100%;
      padding: 12px 16px;
      font-size: 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      outline: none;
      background: white;
      cursor: pointer;
      transition: all 0.3s ease;
      appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 20px;
      padding-right: 40px;
    }
    
    .filter-select:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .filter-select:hover {
      border-color: #667eea;
    }
    
    .filter-select option:disabled {
      color: #cbd5e0;
      font-style: italic;
    }
    
    .subject-section {
      margin-bottom: 40px;
    }
    
    .subject-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 12px;
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 20px;
    }
    
    .chapter-subsection {
      margin-bottom: 30px;
      padding-left: 20px;
    }
    
    .chapter-header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    
    .chapter-header h4 {
      font-size: 1.2rem;
      color: #4a5568;
      font-weight: 600;
    }
    
    .chapter-badge {
      background: #edf2f7;
      color: #4a5568;
      padding: 3px 12px;
      border-radius: 15px;
      font-size: 0.8rem;
      font-weight: 600;
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
      <div class="tabs">
        <button class="tab-button active" data-tab="year-wise">Year Wise</button>
        <button class="tab-button" data-tab="subject-wise">Subject Wise</button>
      </div>
      
      <!-- Year Wise Tab Content -->
      <div class="tab-content active" id="year-wise">
        <div class="filters-box">
          <div class="filter-group">
            <label class="filter-label" for="filterYear">Filter by Year</label>
            <select class="filter-select" id="filterYear">
              <option value="">All Years</option>
              ${(() => {
                const years = new Set();
                Object.values(organized).forEach(exams => {
                  exams.forEach(exam => {
                    if (exam.year) years.add(exam.year);
                  });
                });
                return Array.from(years).sort((a, b) => b - a).map(year => 
                  `<option value="${year}">${year}</option>`
                ).join('');
              })()}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label" for="filterMonth">Filter by Month</label>
            <select class="filter-select" id="filterMonth">
              <option value="">All Months</option>
              ${(() => {
                const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 
                                   'July', 'August', 'September', 'October', 'November', 'December'];
                const months = new Set();
                Object.values(organized).forEach(exams => {
                  exams.forEach(exam => {
                    if (exam.month) months.add(exam.month);
                  });
                });
                return monthOrder.filter(m => months.has(m)).map(month => 
                  `<option value="${month}">${month}</option>`
                ).join('');
              })()}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label" for="filterExamType">Filter by Exam Type</label>
            <select class="filter-select" id="filterExamType">
              <option value="">All Exam Types</option>
              <option value="JEE Main">JEE Main</option>
              <option value="JEE Advanced">JEE Advanced</option>
              <option value="IIT JEE">IIT JEE</option>
              <option value="AIEEE">AIEEE</option>
            </select>
          </div>
        </div>
        
        ${Object.entries(organized).map(([examType, exams]) => {
          if (exams.length === 0) return '';
          
          const displayName = examType === 'jee-main' ? 'JEE Main & AIEEE' : 'JEE Advanced & IIT JEE';
          
          return `
        <div class="section year-section" data-exam-type="${examType}">
          <div class="section-header">
            <h2>${displayName}</h2>
            <span class="section-badge">${exams.length} Papers</span>
          </div>
          
          <div class="exam-grid" id="${examType}-grid">
            ${exams.map(exam => `
            <a href="${exam.path}" class="exam-card" data-title="${exam.title.toLowerCase()}" data-year="${exam.year || ''}" data-month="${exam.month || ''}" data-exam-type="${exam.examType}">
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
        
        <div class="no-results" id="noResultsYear" style="display: none;">
          No exams found matching your search.
        </div>
      </div>
      
      <!-- Subject Wise Tab Content -->
      <div class="tab-content" id="subject-wise">
        <div class="filters-box">
          <div class="filter-group">
            <label class="filter-label" for="filterSubject">Filter by Subject</label>
            <select class="filter-select" id="filterSubject">
              <option value="">All Subjects</option>
              ${Object.keys(subjectOrganized).sort().map(subject => 
                `<option value="${subject}">${subject}</option>`
              ).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label" for="filterChapter">Filter by Chapter</label>
            <select class="filter-select" id="filterChapter">
              <option value="">All Chapters</option>
              ${(() => {
                const chapters = new Set();
                Object.values(subjectOrganized).forEach(subjectChapters => {
                  Object.keys(subjectChapters).forEach(chapter => {
                    chapters.add(chapter);
                  });
                });
                return Array.from(chapters).sort().map(chapter => 
                  `<option value="${chapter}">${toReadableFormat(chapter)}</option>`
                ).join('');
              })()}
            </select>
          </div>
        </div>
        
        ${Object.entries(subjectOrganized).sort((a, b) => a[0].localeCompare(b[0])).map(([subject, chapters]) => {
          const totalQuestionsInSubject = Object.values(chapters).reduce((sum, questions) => sum + questions.length, 0);
          
          return `
        <div class="subject-section" data-subject="${subject.toLowerCase()}">
          <div class="subject-header">${subject}</div>
          
          ${Object.entries(chapters).sort((a, b) => a[0].localeCompare(b[0])).map(([chapter, questions]) => {
            const chapterSlug = chapter.toLowerCase().replace(/\s+/g, '-');
            const chapterPath = `chapters/${subject.toLowerCase()}/${chapterSlug}.html`;
            
            return `
          <div class="chapter-subsection" data-chapter="${chapter.toLowerCase()}">
            <div class="chapter-header">
              <h4>${toReadableFormat(chapter)}</h4>
              <span class="chapter-badge">${questions.length} Question${questions.length > 1 ? 's' : ''}</span>
            </div>
            
            <div class="exam-grid">
              <a href="${chapterPath}" class="exam-card" data-title="${toReadableFormat(chapter).toLowerCase()}">
                <div class="exam-title">View All ${toReadableFormat(chapter)} Questions</div>
                <div class="exam-meta">
                  <span class="exam-tag">${questions.length} Questions</span>
                  <span class="exam-tag">${new Set(questions.map(q => q.examKey)).size} Exams</span>
                </div>
              </a>
            </div>
          </div>
            `;
          }).join('')}
        </div>
          `;
        }).join('')}
        
        <div class="no-results" id="noResultsSubject" style="display: none;">
          No subjects or chapters found matching your search.
        </div>
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
    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        
        // Remove active class from all buttons and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        document.getElementById(tabId).classList.add('active');
      });
    });
    
    // Filter functionality for Year Wise tab with linked filters
    const filterYear = document.getElementById('filterYear');
    const filterMonth = document.getElementById('filterMonth');
    const filterExamType = document.getElementById('filterExamType');
    const yearSections = document.querySelectorAll('.year-section');
    const noResultsYear = document.getElementById('noResultsYear');
    
    // Store all exam data for dynamic filtering
    const allExamCards = Array.from(document.querySelectorAll('.year-section .exam-card'));
    const examData = allExamCards.map(card => ({
      element: card,
      year: card.getAttribute('data-year'),
      month: card.getAttribute('data-month'),
      examType: card.getAttribute('data-exam-type')
    }));
    
    // Month ordering for proper sorting
    const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    function updateFilterOptions() {
      const selectedYear = filterYear.value;
      const selectedMonth = filterMonth.value;
      const selectedExamType = filterExamType.value;
      
      // Get available options based on current filters
      const availableYears = new Set();
      const availableMonths = new Set();
      const availableExamTypes = new Set();
      
      examData.forEach(exam => {
        const yearMatch = !selectedYear || exam.year === selectedYear;
        const monthMatch = !selectedMonth || exam.month === selectedMonth;
        const examTypeMatch = !selectedExamType || exam.examType === selectedExamType;
        
        if (monthMatch && examTypeMatch) availableYears.add(exam.year);
        if (yearMatch && examTypeMatch) availableMonths.add(exam.month);
        if (yearMatch && monthMatch) availableExamTypes.add(exam.examType);
      });
      
      // Update Year filter options
      Array.from(filterYear.options).forEach(option => {
        if (option.value === '') {
          option.disabled = false;
        } else {
          option.disabled = !availableYears.has(option.value);
        }
      });
      
      // Update Month filter options
      Array.from(filterMonth.options).forEach(option => {
        if (option.value === '') {
          option.disabled = false;
        } else {
          option.disabled = !availableMonths.has(option.value);
        }
      });
      
      // Update Exam Type filter options
      Array.from(filterExamType.options).forEach(option => {
        if (option.value === '') {
          option.disabled = false;
        } else {
          option.disabled = !availableExamTypes.has(option.value);
        }
      });
    }
    
    function applyYearFilters() {
      const selectedYear = filterYear.value;
      const selectedMonth = filterMonth.value;
      const selectedExamType = filterExamType.value;
      let visibleCount = 0;
      
      yearSections.forEach(section => {
        const cards = section.querySelectorAll('.exam-card');
        let sectionVisibleCount = 0;
        
        cards.forEach(card => {
          const cardYear = card.getAttribute('data-year');
          const cardMonth = card.getAttribute('data-month');
          const cardExamType = card.getAttribute('data-exam-type');
          
          const yearMatch = !selectedYear || cardYear === selectedYear;
          const monthMatch = !selectedMonth || cardMonth === selectedMonth;
          const examTypeMatch = !selectedExamType || cardExamType === selectedExamType;
          
          if (yearMatch && monthMatch && examTypeMatch) {
            card.style.display = 'block';
            sectionVisibleCount++;
            visibleCount++;
          } else {
            card.style.display = 'none';
          }
        });
        
        section.style.display = sectionVisibleCount > 0 ? 'block' : 'none';
      });
      
      noResultsYear.style.display = visibleCount === 0 ? 'block' : 'none';
      
      // Update available options in other filters
      updateFilterOptions();
    }
    
    filterYear.addEventListener('change', applyYearFilters);
    filterMonth.addEventListener('change', applyYearFilters);
    filterExamType.addEventListener('change', applyYearFilters);
    
    // Filter functionality for Subject Wise tab with linked filters
    const filterSubject = document.getElementById('filterSubject');
    const filterChapter = document.getElementById('filterChapter');
    const subjectSections = document.querySelectorAll('.subject-section');
    const noResultsSubject = document.getElementById('noResultsSubject');
    
    // Store subject-chapter relationships
    const subjectChapterData = [];
    subjectSections.forEach(section => {
      const subject = section.getAttribute('data-subject');
      const chapters = section.querySelectorAll('.chapter-subsection');
      chapters.forEach(chapter => {
        const chapterName = chapter.getAttribute('data-chapter');
        subjectChapterData.push({ subject, chapter: chapterName });
      });
    });
    
    function updateSubjectFilterOptions() {
      const selectedSubject = filterSubject.value;
      const selectedChapter = filterChapter.value;
      
      // Get available options based on current filters
      const availableSubjects = new Set();
      const availableChapters = new Set();
      
      subjectChapterData.forEach(item => {
        const subjectMatch = !selectedSubject || item.subject === selectedSubject.toLowerCase();
        const chapterMatch = !selectedChapter || item.chapter === selectedChapter.toLowerCase();
        
        if (chapterMatch) availableSubjects.add(item.subject);
        if (subjectMatch) availableChapters.add(item.chapter);
      });
      
      // Update Subject filter options
      Array.from(filterSubject.options).forEach(option => {
        if (option.value === '') {
          option.disabled = false;
        } else {
          option.disabled = !availableSubjects.has(option.value.toLowerCase());
        }
      });
      
      // Update Chapter filter options
      Array.from(filterChapter.options).forEach(option => {
        if (option.value === '') {
          option.disabled = false;
        } else {
          option.disabled = !availableChapters.has(option.value.toLowerCase());
        }
      });
    }
    
    function applySubjectFilters() {
      const selectedSubject = filterSubject.value;
      const selectedChapter = filterChapter.value;
      let visibleCount = 0;
      
      subjectSections.forEach(section => {
        const subject = section.getAttribute('data-subject');
        let sectionVisibleCount = 0;
        
        const chapters = section.querySelectorAll('.chapter-subsection');
        chapters.forEach(chapter => {
          const chapterName = chapter.getAttribute('data-chapter');
          const cards = chapter.querySelectorAll('.exam-card');
          let chapterVisibleCount = 0;
          
          const subjectMatch = !selectedSubject || subject === selectedSubject.toLowerCase();
          const chapterMatch = !selectedChapter || chapterName === selectedChapter.toLowerCase();
          
          if (subjectMatch && chapterMatch) {
            cards.forEach(card => {
              card.style.display = 'block';
              chapterVisibleCount++;
              sectionVisibleCount++;
              visibleCount++;
            });
          } else {
            cards.forEach(card => {
              card.style.display = 'none';
            });
          }
          
          chapter.style.display = chapterVisibleCount > 0 ? 'block' : 'none';
        });
        
        section.style.display = sectionVisibleCount > 0 ? 'block' : 'none';
      });
      
      noResultsSubject.style.display = visibleCount === 0 ? 'block' : 'none';
      
      // Update available options in other filters
      updateSubjectFilterOptions();
    }
    
    filterSubject.addEventListener('change', applySubjectFilters);
    filterChapter.addEventListener('change', applySubjectFilters);
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
    
    // Step 3: Get organized HTML files (year-wise)
    console.log('3. Scanning HTML files (year-wise)...');
    const organized = await getOrganizedHtmlFiles();
    const totalFiles = Object.values(organized).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`   Found ${totalFiles} HTML files`);
    
    // Step 4: Get organized data (subject-wise)
    console.log('4. Organizing by subject and chapter...');
    const subjectOrganized = await getOrganizedBySubject();
    const subjectCount = Object.keys(subjectOrganized).length;
    console.log(`   Found ${subjectCount} subjects`);
    
    // Step 5: Generate index.html
    console.log('5. Generating index.html...');
    const indexHtml = generateIndexHtml(organized, subjectOrganized);
    await fs.writeFile(path.join(DIST_DIR, 'index.html'), indexHtml, 'utf8');
    
    // Step 6: Generate chapter-specific pages
    console.log('6. Generating chapter pages...');
    const chapterPages = await generateChapterPages(subjectOrganized);
    console.log(`   Generated ${chapterPages} chapter pages`);
    
    // Step 7: Copy html directory to years
    console.log('7. Copying HTML files to years directory...');
    await copyDirectory(HTML_DIR, path.join(DIST_DIR, 'years'));
    
    // Step 8: Create vercel.json
    console.log('8. Creating vercel.json...');
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
    console.log(`✓ Chapter-specific pages: ${chapterPages}`);
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

