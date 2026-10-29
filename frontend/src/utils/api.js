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

export const UNREACHABLE = 'Can\u2019t reach Hopr right now. Check your connection and try again in a moment.'

// The server's own message when it sent one. When it gave no answer (offline, a timeout)
// or the host answered for it while the API restarts (502-504), say so rather than show a
// fallback such as "Email or password is incorrect" that blames the user.
export function errorMessage(error, fallback = 'Something went wrong') {
  const data = error?.response?.data
  const message = data?.message || data?.errors?.[0]?.msg
  if (message) return message
  if (error?.isAxiosError && (!error.response || [502, 503, 504].includes(error.response.status))) return UNREACHABLE
  return fallback
}

export default api
