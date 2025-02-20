import React, { useState, useEffect } from 'react';

const API_URL = 'http://localhost:8000';

const Alert = ({ children, className }) => (
  <div className={`p-4 rounded-lg bg-red-100 border border-red-400 text-red-700 ${className}`}>
    {children}
  </div>
);

const LoginForm = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
      });

      const data = await response.json();

      if (data.access_token) {
        localStorage.setItem('token', data.access_token);
        // Получаем данные пользователя
        const userResponse = await fetch(`${API_URL}/users/me`, {
          headers: {
            'Authorization': `Bearer ${data.access_token}`
          }
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          onLogin(userData);
        } else {
          setError('Failed to get user data');
        }
      } else {
        setError('Login failed');
      }
    } catch (error) {
      setError('Login failed');
      console.error('Login error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-white rounded shadow">
      {error && <Alert>{error}</Alert>}
      <div>
        <input
          type="text"
          placeholder="Username"
          className="w-full p-2 border rounded"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div>
        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 border rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Login
      </button>
    </form>
  );
};

const RoomMap = ({ rooms, bookings, onBookRoom }) => {
  const getStatusColor = (room) => {
    if (room.status === 'unavailable') return 'bg-gray-500';
    if (room.status === 'booked') return 'bg-red-500';
    return 'bg-green-500';
  };

  return (
    <div className="grid grid-cols-4 gap-4 p-4">
      {rooms.map((room) => (
        <button
          key={room.id}
          className={`p-4 text-white rounded ${getStatusColor(room)}`}
          onClick={() => room.status !== 'unavailable' && onBookRoom(room)}
          disabled={room.status === 'unavailable'}
        >
          <div className="font-bold">{room.number}</div>
          {room.status === 'booked' && bookings.find(b => b.room_id === room.id) && (
            <div className="text-sm">
              Booked by: {bookings.find(b => b.room_id === room.id).user.full_name}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

const BookingTable = ({ rooms, bookings }) => {
  const timeSlots = [
    '08:00-09:35',
    '09:45-11:20',
    '11:30-13:05',
    '13:30-15:05',
    '15:15-16:50',
    '17:00-18:35'
  ];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="p-2 border">Room</th>
            {timeSlots.map(slot => (
              <th key={slot} className="p-2 border">{slot}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rooms.map(room => (
            <tr key={room.id}>
              <td className="p-2 border font-bold">{room.number}</td>
              {timeSlots.map(slot => {
                const booking = bookings.find(b => {
                  const startTime = new Date(b.start_time).toTimeString().slice(0, 5);
                  return b.room_id === room.id && startTime === slot.split('-')[0];
                });
                return (
                  <td key={slot} className="p-2 border">
                    {booking ? (
                      <div className="text-sm">
                        <div>{booking.user.full_name}</div>
                        <div className="text-gray-500">{booking.user.role}</div>
                      </div>
                    ) : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const App = () => {
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [user, setUser] = useState(null);
  const [view, setView] = useState('map');
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [roomsResponse, bookingsResponse] = await Promise.all([
        fetch(`${API_URL}/rooms`, { headers }),
        fetch(`${API_URL}/bookings`, { headers })
      ]);

      if (roomsResponse.ok && bookingsResponse.ok) {
        const [roomsData, bookingsData] = await Promise.all([
          roomsResponse.json(),
          bookingsResponse.json()
        ]);
        setRooms(roomsData);
        setBookings(bookingsData);
      } else {
        setError('Failed to fetch data');
      }
    } catch (error) {
      setError('Failed to fetch data');
      console.error('Fetch error:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogin = async (userData) => {
    setUser(userData);
    fetchData(); // Обновляем данные после входа
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const handleBookRoom = async (room) => {
    if (!user) {
      setError('Please login first');
      return;
    }

    try {
      const now = new Date();
      now.setMinutes(Math.floor(now.getMinutes() / 5) * 5); // Округляем до 5 минут

      const endTime = new Date(now);
      endTime.setMinutes(endTime.getMinutes() + 95); // 1 час 35 минут

      const response = await fetch(`${API_URL}/rooms/${room.id}/book`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_time: now.toISOString(),
          end_time: endTime.toISOString(),
        }),
      });

      if (response.ok) {
        fetchData(); // Обновляем данные
      } else {
        const error = await response.json();
        setError(error.detail);
      }
    } catch (error) {
      setError('Failed to book room');
      console.error('Booking error:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      {error && (
        <Alert className="mb-4">{error}</Alert>
      )}

      <div className="mb-4 flex justify-between items-center">
        <div>
          <button
            className={`mr-2 px-4 py-2 rounded ${view === 'map' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            onClick={() => setView('map')}
          >
            Map View
          </button>
          <button
            className={`px-4 py-2 rounded ${view === 'table' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            onClick={() => setView('table')}
          >
            Table View
          </button>
        </div>
        {!user ? (
          <LoginForm onLogin={handleLogin} />
        ) : (
          <div className="flex items-center gap-4">
            <div className="text-sm">
              Logged in as: {user.full_name} ({user.role})
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {view === 'map' ? (
        <RoomMap
          rooms={rooms}
          bookings={bookings}
          onBookRoom={handleBookRoom}
        />
      ) : (
        <BookingTable rooms={rooms} bookings={bookings} />
      )}
    </div>
  );
};

export default App;