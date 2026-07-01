import { supabase } from '@/src/lib/supabase/client'

export const NOTIFICATIONS_READ_EVENT = 'sari:notifications-read'

type NotificationPayload = {
  userId: string
  title: string
  message?: string
  type?: string
}

export type NotificationRecord = {
  id: string
  title: string
  message: string | null
  type: string
  is_read: boolean
  created_at: string
}

export async function createNotification({
  userId,
  title,
  message,
  type = 'info',
}: NotificationPayload) {
  const { error } = await supabase.rpc('create_internal_notification', {
    p_user_id: userId,
    p_title: title,
    p_message: message || null,
    p_type: type,
  })
  return { error }
}

export async function fetchCurrentUserNotifications(limit = 10) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []) as NotificationRecord[]
}

export async function markCurrentUserNotificationsAsRead() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: new Error('No hay sesión activa') }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  return { error }
}
