import '../../../../src/app/globals.css'
import { Toaster } from 'sonner'
import { UserProvider } from '@/src/hooks/useUser'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body><UserProvider>{children}</UserProvider><Toaster /></body></html>
}
