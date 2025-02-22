// src/components/RoomSchedule.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function RoomSchedule() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [room, setRoom] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [weekDates, setWeekDates] = useState([]);

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
    // Получаем дату из URL или используем текущую
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    setSelectedDate(dateParam || new Date().toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      // Получаем даты для текущей недели
      const date = new Date(selectedDate);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));

      const weekDates = [];
      for (let i = 0; i < 6; i++) {
        const currentDate = new Date(monday);
        currentDate.setDate(monday.getDate() + i);
        weekDates.push(currentDate.toISOString().split('T')[0]);
      }
      setWeekDates(weekDates);

      fetchRoomData();
      fetchSchedule();
    }
  }, [id, selectedDate]);

  const fetchRoomData = async () => {
    try {
      const response = await fetch(`http://localhost:8000/cabinets/${id}`);
      if (!response.ok) throw new Error('Кабинет не найден');
      const data = await response.json();
      setRoom(data);
    } catch (err) {
      setError('Не удалось загрузить информацию о кабинете');
      console.error('Error fetching room:', err);
    }
  };

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8000/cabinets/${id}/schedule?date=${selectedDate}`
      );
      if (!response.ok) throw new Error('Не удалось загрузить расписание');
      const data = await response.json();
      setSchedule(data);
      setError('');
    } catch (err) {
      setError('Не удалось загрузить расписание');
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const getBookingForSlot = (date, pairNumber) => {
    return schedule.find(booking => {
      const bookingDate = new Date(booking.date).toISOString().split('T')[0];
      return bookingDate === date &&
             booking.start_time === pairs[pairNumber - 1].time.split('-')[0] &&
             booking.end_time === pairs[pairNumber - 1].time.split('-')[1];
    });
  };

  const canBookSlot = (booking) => {
    if (!user) return false;
    if (!booking) return true; // слот свободен

    const priorities = {
      'dispetcher': 4,
      'prepod': 3,
      'union': 2,
      'prostoi-smertni': 1
    };

    return priorities[user.priority] > priorities[booking.user_role];
  };

  const handleBooking = async (date, pairNum) => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      const existingBooking = getBookingForSlot(date, pairNum);
      if (existingBooking && !canBookSlot(existingBooking)) {
        throw new Error('Недостаточно прав для изменения этой брони');
      }

      const pairTime = pairs[pairNum - 1].time.split('-');

      const pairResponse = await fetch('http://localhost:8000/pairs/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: date,
          start_time: pairTime[0].trim(),
          end_time: pairTime[1].trim()
        }),
      });

      if (!pairResponse.ok) {
        const errorData = await pairResponse.json();
        throw new Error(errorData.detail || 'Ошибка при создании записи пары');
      }

      const pairData = await pairResponse.json();

      const bookingResponse = await fetch(`http://localhost:8000/pairs_cabinets/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pair_id: pairData.id,
          cabinet_id: id,
          user_id: user.id,
          purpose: 'Бронирование кабинета'
        }),
      });

      if (!bookingResponse.ok) {
        const errorData = await bookingResponse.json();
        throw new Error(errorData.detail || 'Ошибка при бронировании');
      }

      await fetchSchedule();
      setError('');
    } catch (err) {
      setError(err.message || 'Ошибка при бронировании');
      console.error('Booking error:', err);
    }
  };

  const getSlotStyle = (booking) => {
    if (!booking) return 'cursor-pointer hover:bg-gray-50';

    const isBookable = canBookSlot(booking);
    return `${isBookable ? 'cursor-pointer hover:bg-gray-50' : ''} ${booking ? 'bg-gray-50' : ''}`;
  };

  const formatDateHeader = (dateStr) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric'
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {room && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Кабинет {room.number}
            </h2>
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">
                Неделя с:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  const params = new URLSearchParams(window.location.search);
                  params.set('date', e.target.value);
                  navigate(`/rooms/${id}?${params.toString()}`);
                }}
                className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="mt-4 text-gray-600">
            <p>Этаж: {room.floor}</p>
            <p>Тип: {room.type}</p>
            {room.description && <p>Описание: {room.description}</p>}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Время
                </th>
                {weekDates.map(date => (
                  <th
                    key={date}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {formatDateHeader(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pairs.map((pair) => (
                <tr key={pair.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {pair.id} пара
                    <br />
                    <span className="text-gray-500">{pair.time}</span>
                  </td>
                  {weekDates.map(date => {
                    const booking = getBookingForSlot(date, pair.id);
                    const isBookable = !booking || canBookSlot(booking);

                    return (
                      <td
                        key={`${date}-${pair.id}`}
                        className={`px-6 py-4 whitespace-nowrap text-sm ${getSlotStyle(booking)}`}
                        onClick={() => isBookable && handleBooking(date, pair.id)}
                        title={booking && !isBookable ? 'Недостаточно прав для изменения брони' : ''}
                      >
                        {booking ? (
                          <div>
                            <p className="font-medium text-gray-900">{booking.user_name}</p>
                            <p className="text-gray-500">{booking.user_group}</p>
                            <p className="text-xs text-gray-400">
                              {booking.user_role === 'dispetcher' ? 'Учебный отдел' :
                               booking.user_role === 'prepod' ? 'Преподаватель' :
                               booking.user_role === 'union' ? 'Студ. объединение' :
                               'Студент'}
                            </p>
                          </div>
                        ) : (
                          <div className="h-full w-full hover:bg-gray-100 rounded transition-colors duration-200" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default RoomSchedule;