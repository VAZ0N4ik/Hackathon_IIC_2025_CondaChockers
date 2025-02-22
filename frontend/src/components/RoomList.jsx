// src/components/RoomList.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function RoomList() {
  const [rooms, setRooms] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedPair, setSelectedPair] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const pairs = [
    { id: 1, time: '08:00-09:35' },
    { id: 2, time: '09:45-11:20' },
    { id: 3, time: '11:30-13:05' },
    { id: 4, time: '13:30-15:05' },
    { id: 5, time: '15:15-16:50' },
    { id: 6, time: '17:00-18:35' },
    { id: 7, time: '18:45-20:20' },
    { id: 8, time: '20:30-22:05' },
  ];

  useEffect(() => {
    // Устанавливаем текущую дату при загрузке
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    setSelectedDate(formattedDate);
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [selectedDate, selectedPair]);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      let url = 'http://localhost:8000/cabinets/';
      if (selectedDate || selectedPair) {
        const params = new URLSearchParams();
        if (selectedDate) params.append('date', selectedDate);
        if (selectedPair) params.append('pair', selectedPair);
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error('Ошибка при загрузке данных');

      const data = await response.json();
      setRooms(data);
      setError('');
    } catch (err) {
      setError('Не удалось загрузить список кабинетов');
      console.error('Error fetching rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoomClick = (roomId) => {
    const params = new URLSearchParams();
    if (selectedDate) params.append('date', selectedDate);
    navigate(`/rooms/${roomId}?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Дата
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Пара
            </label>
            <select
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="">Выберите пару</option>
              {pairs.map((pair) => (
                <option key={pair.id} value={pair.id}>
                  {pair.id} пара ({pair.time})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div
              key={room.id}
              onClick={() => handleRoomClick(room.id)}
              className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer overflow-hidden"
            >
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Кабинет {room.number}
                </h3>
                <div className="space-y-2 text-gray-600">
                  <p>
                    <span className="font-medium">Этаж:</span> {room.floor}
                  </p>
                  <p>
                    <span className="font-medium">Тип:</span> {room.type}
                  </p>
                  {room.description && (
                    <p>
                      <span className="font-medium">Описание:</span> {room.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RoomList;