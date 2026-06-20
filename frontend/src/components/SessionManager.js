/**
 * File: SessionManager.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Tracks user activity and automatically logs the user out after a period
 * of inactivity. Admins get a shorter timeout (30 min) than regular users
 * (60 min), matching the session lifetimes issued by the backend JWT.
 * Renders nothing - this is a logic-only component.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ADMIN_TIMEOUT_MS = 30 * 60 * 1000;
const USER_TIMEOUT_MS = 60 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll'];

// Logs the user out and redirects to login with an inactivity message.
function SessionManager() {
  const { user, logoutUser } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const timeoutMs = user.role === 'ADMIN' ? ADMIN_TIMEOUT_MS : USER_TIMEOUT_MS;

    // Logs out and redirects when no activity has been seen for timeoutMs.
    const handleTimeout = () => {
      logoutUser();
      navigate('/login', { state: { message: 'Your session expired due to inactivity. Please log in again.' } });
    };

    // Restarts the inactivity timer; called on every tracked user interaction.
    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(handleTimeout, timeoutMs);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, resetTimer));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [user, logoutUser, navigate]);

  return null;
}

export default SessionManager;
