import { supabase } from '@/src/lib/supabase/client'

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
  await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message: message || null,
    type,
  })
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

  if (!user) return

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
}
