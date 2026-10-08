import '../styles/globals.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import useAuthStore from '../context/authStore'
import Cookies from 'js-cookie'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const fetchMe = useAuthStore(s => s.fetchMe)
  const user = useAuthStore(s => s.user)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  useEffect(() => {
    if (Cookies.get('accessToken') || Cookies.get('refreshToken')) fetchMe()
  }, [])

  useEffect(() => {
    const path = router.pathname
    const publicPaths = ['/login', '/register']
    const isPublic = publicPaths.includes(path)
    const hasSessionToken = Cookies.get('accessToken') || Cookies.get('refreshToken')

    if (!isPublic && !isAuthenticated && !hasSessionToken) {
      router.replace('/login')
      return
    }

    if (!user || !isAuthenticated) return
    if (path.startsWith('/worker') && user.role !== 'worker') {
      router.replace('/citizen/dashboard')
      return
    }
    if (path.startsWith('/authority') && !['authority', 'admin'].includes(user.role)) {
      router.replace(user.role === 'worker' ? '/worker/dashboard' : '/citizen/dashboard')
      return
    }
    if (path.startsWith('/citizen') && !['citizen'].includes(user.role)) {
      router.replace(user.role === 'worker' ? '/worker/dashboard' : '/authority/dashboard')
    }
  }, [router, router.pathname, user, isAuthenticated])

  const getLayout = Component.getLayout || (page => page)

  return (
    <QueryClientProvider client={queryClient}>
      {getLayout(<Component {...pageProps} />)}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontSize: '14px',
            borderRadius: '10px',
            padding: '12px 16px',
            fontFamily: 'Inter, system-ui, sans-serif',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          },
          success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  )
}
