import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../constants/app';

export function useAuth() {
  const [userPhone, setUserPhone] = useState<string>('');
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  useEffect(() => {
    const savedPhone = localStorage.getItem(STORAGE_KEYS.USER_PHONE);
    if (savedPhone) {
      setUserPhone(savedPhone);
    }
  }, []);

  const handleLoginSuccess = (phone: string) => {
    setUserPhone(phone);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.USER_PHONE);
    localStorage.removeItem(STORAGE_KEYS.LOGIN_TIME);
    setUserPhone('');
  };

  return {
    userPhone,
    showLoginDialog,
    setShowLoginDialog,
    handleLoginSuccess,
    handleLogout,
  };
}