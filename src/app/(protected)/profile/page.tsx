'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'

const compressImage = async (file: File) => {
  return new Promise<File>((resolve) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      const maxWidth = 512
      const scale = Math.min(1, maxWidth / img.width)

      canvas.width = img.width * scale
      canvas.height = img.height * scale

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl)

          if (!blob) {
            resolve(file)
            return
          }

          resolve(
            new File([blob], file.name, {
              type: 'image/jpeg',
            })
          )
        },
        'image/jpeg',
        0.8
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }

    img.src = objectUrl
  })
}

export default function ProfilePage() {
  const { user, profile, loading } = useUser()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile?.avatar_url ?? null
  )
  const [uploading, setUploading] = useState(false)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (!profile) return

    setNombre(profile.nombre || '')
    setApellido(profile.apellido || '')
    setAvatarUrl(profile.avatar_url ?? null)
  }, [profile])

  const currentAvatarUrl = avatarUrl ?? profile?.avatar_url ?? null
  const displayName = profile?.nombre
    ? `${profile.nombre} ${profile.apellido || ''}`.trim()
    : 'Usuario'

  const handleAvatarUpload = async (file: File) => {
    if (!user) return

    setUploading(true)

    const compressed = await compressImage(file)
    const filePath = `${user.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, compressed, { upsert: true })

    if (uploadError) {
      setUploading(false)
      alert(`No se pudo subir la imagen: ${uploadError.message}`)
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: data.publicUrl })
      .eq('id', user.id)

    setUploading(false)

    if (profileError) {
      alert(`No se pudo actualizar el perfil: ${profileError.message}`)
      return
    }

    setAvatarUrl(data.publicUrl)
  }

  const handleProfileUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!user) return

    setSavingProfile(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
      })
      .eq('id', user.id)

    setSavingProfile(false)

    if (error) {
      alert(`No se pudo actualizar el perfil: ${error.message}`)
      return
    }

    alert('Perfil actualizado.')
  }

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('Completa todos los campos de contrasena.')
      return
    }

    if (newPassword !== confirmPassword) {
      alert('La nueva contrasena y la confirmacion no coinciden.')
      return
    }

    if (newPassword.length < 8) {
      alert('La nueva contrasena debe tener al menos 8 caracteres.')
      return
    }

    setSavingPassword(true)

    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user?.email) {
      setSavingPassword(false)
      alert(userError?.message || 'No se pudo validar el usuario actual.')
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword,
    })

    if (signInError) {
      setSavingPassword(false)
      alert('La contrasena actual no es correcta.')
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    setSavingPassword(false)

    if (error) {
      alert(`No se pudo actualizar la contrasena: ${error.message}`)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    alert('Contrasena actualizada.')
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando perfil...</p>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Mi perfil
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Administra tu información visible dentro del ERP.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#0b1220]">
        <div className="flex items-center gap-5">
          {currentAvatarUrl ? (
            <img
              src={currentAvatarUrl}
              alt={displayName}
              className="h-24 w-24 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-2xl font-semibold text-slate-600 ring-2 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                {displayName}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {profile?.rol || 'Sin rol'} · {profile?.email || user?.email}
              </p>
            </div>

            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleAvatarUpload(file)
              }}
              className="block text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800 disabled:opacity-50 dark:text-slate-300"
            />

            {uploading && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Subiendo imagen...
              </p>
            )}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleProfileUpdate}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#0b1220]"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Datos personales
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Estos datos se usan para mostrar tu nombre en el sistema.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nombre
            </label>
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Apellido
            </label>
            <input
              value={apellido}
              onChange={(event) => setApellido(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingProfile ? 'Guardando...' : 'Guardar perfil'}
        </button>
      </form>

      <form
        onSubmit={handlePasswordUpdate}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#0b1220]"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Contraseña
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Actualiza la contraseña de acceso a tu cuenta.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Contraseña actual
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nueva contraseña
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className="h-12 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirmar nueva contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="h-12 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingPassword}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>
      </form>
    </div>
  )
}
