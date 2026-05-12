'use client'

import { useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {

  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async () => {

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      alert(error.message)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">

      <div className="w-[400px] bg-white p-8 rounded-xl shadow">

        <h1 className="text-2xl font-bold mb-6">
          Sari Express
        </h1>

        <div className="space-y-4">

          <input
            type="email"
            placeholder="Correo"
            className="w-full border p-3 rounded"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Contraseña"
            className="w-full border p-3 rounded"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            className="w-full bg-black text-white p-3 rounded"
          >
            Ingresar
          </button>

        </div>

      </div>

    </div>
  )
}