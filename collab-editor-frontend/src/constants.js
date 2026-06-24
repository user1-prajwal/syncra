export const LANGUAGES = [
  'python',
  'c',
  'cpp',
  'java',
  'typescript',
  'csharp',
  'fsharp',
  'php',
  'ruby',
  'haskell',
  'go',
  'rust',
  'text'
]

export const LANGUAGE_DISPLAY = {
  // javascript: 'JavaScript',
  python: 'Python',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  typescript: 'TypeScript',
  csharp: 'C#',
  fsharp: 'F#',
  php: 'PHP',
  ruby: 'Ruby',
  haskell: 'Haskell',
  go: 'Go',
  rust: 'Rust',
  text: 'Text'
}



export const COLORS = [
  '#FF6B6B', // 1. coral red
  '#4ECDC4', // 2. teal blue
  '#45B7D1', // 3. sky blue
  '#96CEB4', // 4. sage green
  '#DDA0DD', // 5. plum purple
  '#F7DC6F', // 6. soft yellow
  '#E07A5F', // 7. terracotta orange
  '#A29BFE', // 8. periwinkle blue
  '#2D3436', // 9. deep charcoal
  '#E17055', // 10. warm amber
  '#E84393', // 11. orchid pink
  '#2ECC71', // 12. forest green
  '#0984E3', // 13. electric blue
  '#D35400', // 14. mustard gold
  '#34495E', // 15. dark slate
  '#8E44AD', // 16. bright violet
  '#82E0AA', // 17. mint green
  '#F0B27A', // 18. peach beige

]
export const SESSION_COLOR = COLORS[Math.floor(Math.random() * COLORS.length)]
export const BACKEND_URL = 'https://collab-editor-backend-p7at.onrender.com'
// export const BACKEND_URL = 'http://localhost:4000'
