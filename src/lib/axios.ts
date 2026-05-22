import axios from 'axios'
import { useAuthStore } from '../stores/useAuthStore'

const api = axios.create({
  baseURL: `${import.meta.env.VITE_SUPABASE_URL}/rest/v1`,
  headers: {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  try {
    // Obtenemos el token síncronamente desde el store de Zustand
    const session = useAuthStore.getState().session;
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (error) {
    console.error('Error setting Supabase session token in Axios interceptor:', error)
  }
  return config
})

export default api