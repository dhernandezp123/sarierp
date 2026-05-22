import { supabase } from '@/src/lib/supabase/client'

type NotificationPayload = {
  userId: string
  title: string
  message?: string
  type?: string
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