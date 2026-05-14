import { create } from 'zustand';
import { authApi } from '../services/api';

const useAuthStore = create((set) => ({
  user:    null,
  token:   localStorage.getItem('mp_token') || null,
  loading: false,
  error:   null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.login({ email, password });
      localStorage.setItem('mp_token', data.token);
      set({ user: data.user, token: data.token, loading: false });
      return true;
    } catch (err) {
      set({ error: err.response?.data?.error || 'Login failed', loading: false });
      return false;
    }
  },

  register: async (name, email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authApi.register({ name, email, password });
      localStorage.setItem('mp_token', data.token);
      set({ user: data.user, token: data.token, loading: false });
      return true;
    } catch (err) {
      set({ error: err.response?.data?.error || 'Registration failed', loading: false });
      return false;
    }
  },

  fetchMe: async () => {
    try {
      const { data } = await authApi.me();
      set({ user: data.user });
    } catch {
      set({ user: null, token: null });
      localStorage.removeItem('mp_token');
    }
  },

  logout: () => {
    localStorage.removeItem('mp_token');
    set({ user: null, token: null });
    window.location.href = '/login';
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
