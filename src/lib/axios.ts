import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: `${import.meta.env.VITE_SUPABASE_URL}/rest/v1`,
  headers: {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (error) {
    console.error('Error setting Supabase session token in Axios interceptor:', error)
  }
  return config
})

export default api