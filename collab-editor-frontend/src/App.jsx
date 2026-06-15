import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import EditorPage from './pages/EditorPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/room/:roomId" element={<EditorPage />} />
    </Routes>
  )
}

export default App