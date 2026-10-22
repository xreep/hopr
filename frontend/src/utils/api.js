import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Endpoints where a 401 is an expected answer (wrong password), not an expired session
const NO_REDIRECT = ['/auth/login', '/auth/register', '/auth/password']

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    if (error.response?.status === 401 && !NO_REDIRECT.some(p => url.startsWith(p))) {
      localStorage.removeItem('token')
      localStorage.removeItem('hopr:user')
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/track')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export function errorMessage(error, fallback = 'Something went wrong') {
  return error?.response?.data?.message || error?.response?.data?.errors?.[0]?.msg || fallback
}

export default api
