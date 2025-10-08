# JEE Exam Papers - Static Site

A complete collection of JEE Main, JEE Advanced, IIT JEE, and AIEEE past year papers with solutions, formatted with MathJax for proper mathematical equations.

## 📊 Data Collection

- **JEE Main**: 167 papers
- **JEE Advanced**: 38 papers
- **Total**: 205 exam papers with 14,886+ questions

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

```bash
cd jee-scraped
npm install
```

## 📦 Build & Deploy

### Build for Production

```bash
npm run build
```

This will:
1. Generate the index page
2. Copy all HTML files to `dist/`
3. Create deployment configuration files
4. Prepare the site for static hosting

### Preview Locally

```bash
npm run preview
```

Then open http://localhost:3000 in your browser.

## 🛠 Scripts

### Data Conversion Scripts

```bash
# Convert raw JSON to HTML
npm run convert:html

# Convert raw JSON to LLM format
npm run convert:llm

# Convert raw JSON to both HTML and LLM formats
npm run convert:all

# Convert HTML to PDF (requires more time)
npm run convert:pdf
```

### Build Scripts

```bash
# Build the static site
npm run build

# Preview locally
npm run preview

