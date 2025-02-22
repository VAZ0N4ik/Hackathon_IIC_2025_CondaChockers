// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from 'components/Login';
import RoomList from 'components/RoomList';
import RoomSchedule from 'components/RoomSchedule';
import { AuthProvider } from 'context/AuthContext';
import Navbar from 'components/Navbar';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-100">
          <Navbar />
          <main className="container mx-auto px-4 py-8">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/rooms" element={<RoomList />} />
              <Route path="/rooms/:id" element={<RoomSchedule />} />
              <Route path="/" element={<Navigate to="/rooms" replace />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;