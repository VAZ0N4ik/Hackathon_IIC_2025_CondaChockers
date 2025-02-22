// src/context/AuthContext.jsx
import { createContext, useState, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  const login = async (username, password) => {
    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'same-origin' // Изменено с 'include' на 'same-origin'
      });

      if (response.ok) {
        const userData = await response.json();
        setUser({
          ...userData,
          role: userData.priority // преобразуем priority в role для фронтенда
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
  };

  const hasPermission = (requiredRole) => {
    if (!user) return false;

    const roles = {
      'dispetcher': 4,
      'prepod': 3,
      'union': 2,
      'prostoi-smertni': 1
    };

    return roles[user.role] >= roles[requiredRole];
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);